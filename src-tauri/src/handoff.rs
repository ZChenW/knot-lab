//! A photo from the phone becomes the picture to trace (ported from Matrix Pad).
//!
//! Showing the code opens a short-lived listener that serves only an upload page and its
//! upload route, both under an unguessable token. On the same Wi-Fi the listener binds the
//! LAN address while the code is shown; for mobile data a loopback listener behind a
//! Cloudflare quick tunnel stays warm between codes until the app exits. Photos wait in
//! memory until the window collects them.

use std::collections::VecDeque;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream, UdpSocket};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

const TTL: Duration = Duration::from_secs(600);
const PORT: u16 = 8767;
const MAX_PENDING: usize = 4;
const MAX_IMAGE_BYTES: usize = 8 * 1024 * 1024;
const MAX_HEAD: usize = 16 * 1024;
const TUNNEL_TIMEOUT: Duration = Duration::from_secs(30);
const PAGE: &str = include_str!("../phone.html");
const PAGE_HEADERS: &str = "Cache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nX-Content-Type-Options: nosniff\r\n\
Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'\r\n";

/// What the window shows: the address, its QR code as SVG, and seconds left.
#[derive(serde::Serialize, Clone)]
pub struct Code {
    mode: String,
    url: String,
    qr: String,
    expires_in: u64,
}

struct Listener {
    stop: Arc<AtomicBool>,
    port: u16,
    thread: Option<thread::JoinHandle<()>>,
}
impl Listener {
    fn close(mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(t) = self.thread.take() {
            let _ = t.join();
        }
    }
}

struct Relay {
    listener: Listener,
    tunnel: Child,
    origin: String,
    health: SocketAddr,
    verified: Instant,
    alive: Arc<AtomicBool>,
}
impl Relay {
    fn live(&mut self) -> bool {
        matches!(self.tunnel.try_wait(), Ok(None)) && self.alive.load(Ordering::SeqCst)
    }
    fn close(mut self) {
        let _ = self.tunnel.kill();
        let _ = self.tunnel.wait();
        self.listener.close();
    }
}

struct Session {
    token: String,
    mode: String,
    url: String,
    qr: String,
    lang: String,
    expires: Instant,
    listener: Option<Listener>,
    photos: VecDeque<Vec<u8>>,
}

#[derive(Default)]
struct Inner {
    session: Option<Session>,
    relay: Option<Relay>,
    closed: bool,
}

#[derive(Default, Clone)]
pub struct Handoff(Arc<Mutex<Inner>>, Arc<Mutex<()>>);

fn current(inner: &mut Inner) -> Option<&mut Session> {
    match &inner.session {
        Some(s) if Instant::now() < s.expires => inner.session.as_mut(),
        _ => None,
    }
}

/// Constant-time comparison: the token is the only credential.
fn same(a: &str, b: &str) -> bool {
    a.len() == b.len() && a.bytes().zip(b.bytes()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

fn token() -> Result<String, String> {
    let mut bytes = [0u8; 16];
    std::fs::File::open("/dev/urandom")
        .and_then(|mut f| f.read_exact(&mut bytes))
        .map_err(|e| format!("handoff.bind_failed:{e}"))?;
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    // 16 bytes as 22 base64url digits, no padding.
    let mut out = String::new();
    let mut acc = 0u32;
    let mut bits = 0;
    for b in bytes {
        acc = (acc << 8) | b as u32;
        bits += 8;
        while bits >= 6 {
            bits -= 6;
            out.push(ALPHABET[((acc >> bits) & 63) as usize] as char);
        }
    }
    if bits > 0 {
        out.push(ALPHABET[((acc << (6 - bits)) & 63) as usize] as char);
    }
    Ok(out)
}

/// The IPv4 address a phone on the same network would use to reach this machine.
fn lan_address() -> Option<Ipv4Addr> {
    if let Ok(v) = std::env::var("KNOT_LAB_PHONE_HOST") {
        if let Ok(a) = v.trim().parse() {
            return Some(a);
        }
    }
    let mut candidates: Vec<(String, Ipv4Addr)> = Vec::new();
    // SAFETY: getifaddrs fills a linked list that is only read here and freed once.
    unsafe {
        let mut list: *mut libc::ifaddrs = std::ptr::null_mut();
        if libc::getifaddrs(&mut list) == 0 {
            let mut p = list;
            while !p.is_null() {
                let ifa = &*p;
                let flags = ifa.ifa_flags as i32;
                if !ifa.ifa_addr.is_null()
                    && (*ifa.ifa_addr).sa_family as i32 == libc::AF_INET
                    && flags & libc::IFF_UP != 0
                    && flags & libc::IFF_RUNNING != 0
                    // VPN tunnels are point-to-point: a phone on the Wi-Fi cannot reach them.
                    && flags & (libc::IFF_LOOPBACK | libc::IFF_POINTOPOINT) == 0
                {
                    let sin = &*(ifa.ifa_addr as *const libc::sockaddr_in);
                    let name = std::ffi::CStr::from_ptr(ifa.ifa_name).to_string_lossy().into_owned();
                    candidates.push((name, Ipv4Addr::from(u32::from_be(sin.sin_addr.s_addr))));
                }
                p = ifa.ifa_next;
            }
            libc::freeifaddrs(list);
        }
    }
    // Connecting a datagram socket sends nothing; it only selects the default route.
    let routed = UdpSocket::bind("0.0.0.0:0")
        .and_then(|s| s.connect("192.0.2.1:9").and_then(|_| s.local_addr()))
        .ok()
        .and_then(|a| match a.ip() {
            std::net::IpAddr::V4(v) => Some(v),
            _ => None,
        });
    if let Some(r) = routed {
        if candidates.iter().any(|(_, a)| *a == r) {
            return Some(r);
        }
    }
    // Behind a VPN the route says nothing: prefer Wi-Fi, then Ethernet, over bridges.
    let rank = |name: &str| {
        if name.starts_with("wl") {
            0
        } else if name.starts_with("en") || name.starts_with("eth") {
            1
        } else {
            2
        }
    };
    candidates.sort_by_key(|(n, _)| rank(n));
    candidates.first().map(|(_, a)| *a)
}

/// Trust the bytes, never the header a phone sent.
fn is_image(data: &[u8]) -> bool {
    data.starts_with(b"\x89PNG\r\n\x1a\n")
        || data.starts_with(b"\xff\xd8\xff")
        || (data.len() >= 12 && &data[..4] == b"RIFF" && &data[8..12] == b"WEBP")
}

fn page_text(lang: &str) -> Vec<(&'static str, &'static str)> {
    let zh = lang != "en";
    let pick = |a: &'static str, b: &'static str| if zh { a } else { b };
    vec![
        ("title", pick("Knot Lab · 拍照临摹", "Knot Lab · Send a photo")),
        (
            "hint",
            pick(
                "拍下一张结的图，裁掉多余的部分，它会出现在电脑上，作为临摹的底图。",
                "Photograph a knot diagram and crop away the rest; it appears on your computer as the picture to trace.",
            ),
        ),
        ("camera", pick("拍照", "Take a photo")),
        ("library", pick("从相册选择", "Choose from library")),
        ("adjust", pick("拖动四角，只留下要临摹的图", "Drag the corners to keep only the diagram")),
        ("change", pick("换一张", "Change")),
        ("rotate", pick("旋转", "Rotate")),
        ("send", pick("发送到电脑", "Send")),
        ("sending", pick("正在发送…", "Sending…")),
        ("sent", pick("已发送，请看电脑。", "Sent. Check your computer.")),
        ("expired", pick("二维码已失效，请在电脑上重新显示二维码。", "This code has expired. Show a new code on your computer.")),
        ("busy", pick("电脑还没取走前几张，请稍后再发。", "The computer has not taken the earlier photos yet; try again shortly.")),
        ("unsupported", pick("不支持这种图片格式，请改用 JPEG 或 PNG。", "Unsupported image format; use JPEG or PNG.")),
        ("too_large", pick("图片太大（上限 8 MB）。", "The image is too large (limit: 8 MB).")),
        ("failed", pick("发送失败，请确认手机能连上电脑的网络。", "Could not send. Make sure the phone can reach this computer's network.")),
    ]
}

fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

fn render_page(lang: &str) -> String {
    let text = page_text(lang);
    let mut page = PAGE.replace("__LANG__", if lang == "en" { "en" } else { "zh" });
    for (name, value) in &text {
        page = page.replace(&format!("__{}__", name.to_uppercase()), &escape_html(value));
    }
    let json = serde_json::to_string(&text.iter().cloned().collect::<std::collections::BTreeMap<_, _>>())
        .unwrap_or_else(|_| "{}".into())
        .replace('<', "\\u003c");
    page.replace("__TEXT__", &json)
}

fn respond(stream: &mut TcpStream, status: &str, extra: &str, body: &[u8]) {
    let head = format!(
        "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n{extra}\r\n",
        body.len()
    );
    let _ = stream.write_all(head.as_bytes());
    let _ = stream.write_all(body);
    let _ = stream.flush();
}

fn serve(state: &Arc<Mutex<Inner>>, mut stream: TcpStream) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(20)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(20)));
    let mut reader = BufReader::new(match stream.try_clone() {
        Ok(s) => s,
        Err(_) => return,
    });
    let mut head = Vec::new();
    loop {
        let mut line = Vec::new();
        match reader.by_ref().take(MAX_HEAD as u64).read_until(b'\n', &mut line) {
            Ok(0) | Err(_) => return,
            Ok(_) => {}
        }
        head.extend_from_slice(&line);
        if head.len() > MAX_HEAD {
            return respond(&mut stream, "431 Request Header Fields Too Large", "", b"");
        }
        if line == b"\r\n" || line == b"\n" {
            break;
        }
    }
    let head = String::from_utf8_lossy(&head);
    let mut lines = head.lines();
    let mut first = lines.next().unwrap_or("").split_whitespace();
    let (method, target) = (first.next().unwrap_or(""), first.next().unwrap_or(""));
    let path = target.split('?').next().unwrap_or("");
    let given = path.strip_prefix("/m/").unwrap_or("");
    // Reject stale or wrong tokens before anything else, and log nothing: the token is the key.
    let lang = {
        let mut inner = state.lock().unwrap();
        match current(&mut inner) {
            Some(s) if same(given, &s.token) => s.lang.clone(),
            _ => return respond(&mut stream, "404 Not Found", "", b""),
        }
    };
    match method {
        "GET" | "HEAD" => {
            let body = render_page(&lang);
            let extra = format!("Content-Type: text/html; charset=utf-8\r\n{PAGE_HEADERS}");
            let body = if method == "HEAD" { Vec::new() } else { body.into_bytes() };
            respond(&mut stream, "200 OK", &extra, &body)
        }
        "POST" => {
            let length = lines
                .filter_map(|l| l.split_once(':'))
                .find(|(k, _)| k.trim().eq_ignore_ascii_case("content-length"))
                .and_then(|(_, v)| v.trim().parse::<usize>().ok());
            let Some(length) = length else {
                return respond(&mut stream, "411 Length Required", "", b"");
            };
            if length > MAX_IMAGE_BYTES {
                return respond(&mut stream, "413 Payload Too Large", "", b"");
            }
            let mut data = vec![0u8; length];
            if reader.read_exact(&mut data).is_err() {
                return;
            }
            let status = {
                let mut inner = state.lock().unwrap();
                match current(&mut inner) {
                    Some(s) if same(given, &s.token) => {
                        if !is_image(&data) {
                            "415 Unsupported Media Type"
                        } else if s.photos.len() >= MAX_PENDING {
                            "429 Too Many Requests"
                        } else {
                            s.photos.push_back(data);
                            "204 No Content"
                        }
                    }
                    _ => "404 Not Found",
                }
            };
            respond(&mut stream, status, "", b"")
        }
        _ => respond(&mut stream, "405 Method Not Allowed", "Allow: GET, POST\r\n", b""),
    }
}

fn listen(state: &Arc<Mutex<Inner>>, host: Ipv4Addr, preferred: u16) -> Result<Listener, String> {
    let socket = TcpListener::bind((host, preferred))
        .or_else(|_| TcpListener::bind((host, 0)))
        .map_err(|e| format!("handoff.bind_failed:{host}: {e}"))?;
    let port = socket.local_addr().map_err(|e| format!("handoff.bind_failed:{e}"))?.port();
    socket.set_nonblocking(true).map_err(|e| format!("handoff.bind_failed:{e}"))?;
    let stop = Arc::new(AtomicBool::new(false));
    let (flag, state) = (stop.clone(), state.clone());
    let thread = thread::spawn(move || {
        while !flag.load(Ordering::SeqCst) {
            match socket.accept() {
                Ok((stream, _)) => {
                    let _ = stream.set_nonblocking(false);
                    let state = state.clone();
                    thread::spawn(move || serve(&state, stream));
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => thread::sleep(Duration::from_millis(40)),
                Err(_) => thread::sleep(Duration::from_millis(40)),
            }
        }
    });
    Ok(Listener { stop, port, thread: Some(thread) })
}

fn find_cloudflared() -> Option<std::path::PathBuf> {
    if let Ok(v) = std::env::var("KNOT_LAB_CLOUDFLARED") {
        if !v.trim().is_empty() {
            return Some(v.trim().into());
        }
    }
    std::env::var_os("PATH")
        .into_iter()
        .flat_map(|p| std::env::split_paths(&p).collect::<Vec<_>>())
        .map(|d| d.join("cloudflared"))
        .find(|p| p.is_file())
}

/// The tunnel's public origin from one line of cloudflared's log; error lines mention
/// api.trycloudflare.com, which is not the tunnel.
fn tunnel_origin(line: &str) -> Option<String> {
    let mut rest = line;
    while let Some(i) = rest.find("https://") {
        let tail = &rest[i..];
        let end = tail.find(|c: char| !(c.is_ascii_alphanumeric() || matches!(c, ':' | '/' | '.' | '-'))).unwrap_or(tail.len());
        let url = &tail[..end];
        let host = &url[8..];
        if host.ends_with(".trycloudflare.com") && !host.starts_with("api.") && host[..host.len() - 18].bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-') {
            return Some(url.to_string());
        }
        rest = &tail[8..];
    }
    None
}

fn open_tunnel(port: u16) -> Result<(Child, String, SocketAddr, Arc<AtomicBool>), String> {
    let command = find_cloudflared().ok_or_else(|| "handoff.no_tunnel".to_string())?;
    let health = TcpListener::bind("127.0.0.1:0")
        .and_then(|p| p.local_addr())
        .map_err(|e| format!("handoff.tunnel_failed:{e}"))?;
    let mut cmd = Command::new(command);
    cmd.args(["tunnel", "--no-autoupdate", "--metrics", &health.to_string(), "--url", &format!("http://127.0.0.1:{port}")])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    // The relay must not outlive the app, even if the app is killed.
    unsafe {
        use std::os::unix::process::CommandExt;
        cmd.pre_exec(|| {
            libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGTERM);
            Ok(())
        });
    }
    let mut child = cmd.spawn().map_err(|e| format!("handoff.tunnel_failed:{e}"))?;
    let stderr = child.stderr.take().unwrap();
    let (tx, rx) = mpsc::channel::<Result<String, String>>();
    let alive = Arc::new(AtomicBool::new(true));
    let alive_reader = alive.clone();
    thread::spawn(move || {
        let (mut origin, mut last, mut sent) = (None::<String>, String::new(), false);
        // Keep draining after the tunnel is up, or cloudflared blocks on a full pipe.
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            if sent {
                continue;
            }
            last = line.clone();
            if origin.is_none() {
                origin = tunnel_origin(&line);
            } else if line.contains("Registered tunnel connection") {
                let _ = tx.send(Ok(origin.clone().unwrap()));
                sent = true;
            }
        }
        alive_reader.store(false, Ordering::SeqCst);
        if !sent {
            let _ = tx.send(Err(last));
        }
    });
    match rx.recv_timeout(TUNNEL_TIMEOUT) {
        Ok(Ok(origin)) => Ok((child, origin, health, alive)),
        other => {
            let _ = child.kill();
            let _ = child.wait();
            let reason = match other {
                Ok(Err(last)) => last.chars().rev().take(200).collect::<Vec<_>>().into_iter().rev().collect(),
                _ => "cloudflared".to_string(),
            };
            Err(format!("handoff.tunnel_failed:{reason}"))
        }
    }
}

/// Whether cloudflared still holds an edge connection, asked of cloudflared itself: the
/// machine's own resolver may not know the public hostname, while a phone reaches it fine.
fn tunnel_ready(health: SocketAddr) -> bool {
    let Ok(mut s) = TcpStream::connect_timeout(&health, Duration::from_secs(2)) else { return false };
    let _ = s.set_read_timeout(Some(Duration::from_secs(2)));
    if s.write_all(format!("GET /ready HTTP/1.1\r\nHost: {health}\r\nConnection: close\r\n\r\n").as_bytes()).is_err() {
        return false;
    }
    let mut first = String::new();
    let _ = BufReader::new(s).read_line(&mut first);
    first.split_whitespace().nth(1) == Some("200")
}

fn qr_svg(url: &str) -> Result<String, String> {
    use qrcode::render::svg;
    let code = qrcode::QrCode::with_error_correction_level(url, qrcode::EcLevel::M).map_err(|e| format!("handoff.bind_failed:{e}"))?;
    Ok(code
        .render::<svg::Color>()
        .min_dimensions(256, 256)
        .dark_color(svg::Color("#000000"))
        .light_color(svg::Color("#ffffff"))
        .quiet_zone(true)
        .build())
}

impl Handoff {
    fn describe(s: &Session) -> Code {
        Code {
            mode: s.mode.clone(),
            url: s.url.clone(),
            qr: s.qr.clone(),
            expires_in: s.expires.saturating_duration_since(Instant::now()).as_secs(),
        }
    }

    fn stop_session(&self) {
        let session = self.0.lock().unwrap().session.take();
        if let Some(Session { listener: Some(l), .. }) = session {
            l.close();
        }
    }

    fn close_relay(&self) {
        let relay = self.0.lock().unwrap().relay.take();
        if let Some(r) = relay {
            r.close();
        }
    }

    fn relay_origin(&self) -> Result<String, String> {
        {
            let mut inner = self.0.lock().unwrap();
            if let Some(relay) = inner.relay.as_mut() {
                let fresh = relay.verified.elapsed() < Duration::from_secs(60);
                if relay.live() && (fresh || tunnel_ready(relay.health)) {
                    relay.verified = Instant::now();
                    return Ok(relay.origin.clone());
                }
            }
        }
        self.close_relay();
        let listener = listen(&self.0, Ipv4Addr::LOCALHOST, 0)?;
        match open_tunnel(listener.port) {
            Ok((tunnel, origin, health, alive)) => {
                let relay = Relay { listener, tunnel, origin: origin.clone(), health, verified: Instant::now(), alive };
                self.0.lock().unwrap().relay = Some(relay);
                Ok(origin)
            }
            Err(e) => {
                listener.close();
                Err(e)
            }
        }
    }

    /// Open the listener, or extend the code already showing so a scanned phone keeps working.
    pub fn start(&self, mode: &str, lang: &str) -> Result<Code, String> {
        let _starting = self.1.lock().unwrap();
        if self.0.lock().unwrap().closed {
            return Err("handoff.closed".into());
        }
        let mode = if mode == "internet" { "internet" } else { "lan" };
        if mode == "lan" {
            self.close_relay();
        }
        {
            let mut inner = self.0.lock().unwrap();
            let same_mode = matches!(current(&mut inner), Some(s) if s.mode == mode);
            if same_mode && (mode == "lan" || inner.relay.is_some()) {
                let s = inner.session.as_mut().unwrap();
                s.lang = lang.to_string();
                s.expires = Instant::now() + TTL;
                return Ok(Self::describe(s));
            }
        }
        self.stop_session();
        let (origin, listener) = if mode == "internet" {
            (self.relay_origin()?, None)
        } else {
            let host = lan_address().ok_or_else(|| "handoff.no_network".to_string())?;
            let preferred = std::env::var("KNOT_LAB_PHONE_PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(PORT);
            let l = listen(&self.0, host, preferred)?;
            (format!("http://{host}:{}", l.port), Some(l))
        };
        let token = token()?;
        let url = format!("{origin}/m/{token}");
        let qr = qr_svg(&url)?;
        let session = Session {
            token,
            mode: mode.into(),
            url,
            qr,
            lang: lang.into(),
            expires: Instant::now() + TTL,
            listener,
            photos: VecDeque::new(),
        };
        let code = Self::describe(&session);
        self.0.lock().unwrap().session = Some(session);
        let me = self.clone();
        thread::spawn(move || me.expire());
        Ok(code)
    }

    /// Close the LAN listener once the code has expired; the relay stays warm.
    fn expire(&self) {
        loop {
            thread::sleep(Duration::from_secs(1));
            let mut inner = self.0.lock().unwrap();
            match &inner.session {
                None => return,
                Some(s) if Instant::now() < s.expires => continue,
                Some(_) => {
                    let session = inner.session.take();
                    drop(inner);
                    if let Some(Session { listener: Some(l), .. }) = session {
                        l.close();
                    }
                    return;
                }
            }
        }
    }

    pub fn stop(&self) {
        self.stop_session();
    }

    /// The oldest waiting photo, an empty answer when nothing waits, or an error once the
    /// code is gone.
    pub fn take(&self) -> Result<Vec<u8>, String> {
        let mut inner = self.0.lock().unwrap();
        match current(&mut inner) {
            Some(s) => Ok(s.photos.pop_front().unwrap_or_default()),
            None => Err("handoff.closed".into()),
        }
    }

    pub fn shutdown(&self) {
        let _starting = self.1.lock().unwrap();
        self.0.lock().unwrap().closed = true;
        self.stop_session();
        self.close_relay();
    }
}

#[tauri::command]
pub async fn handoff_start(state: tauri::State<'_, Handoff>, mode: String, lang: String) -> Result<Code, String> {
    let handoff = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || handoff.start(&mode, &lang))
        .await
        .map_err(|e| format!("handoff.bind_failed:{e}"))?
}

#[tauri::command]
pub fn handoff_stop(state: tauri::State<'_, Handoff>) {
    state.stop();
}

#[tauri::command]
pub fn handoff_take(state: tauri::State<'_, Handoff>) -> Result<tauri::ipc::Response, String> {
    state.take().map(tauri::ipc::Response::new)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn origin_is_the_assigned_host_not_the_api() {
        assert_eq!(tunnel_origin("ERR failed to reach https://api.trycloudflare.com/tunnel"), None);
        assert_eq!(
            tunnel_origin("INF |  https://quiet-river-1234.trycloudflare.com                |"),
            Some("https://quiet-river-1234.trycloudflare.com".into())
        );
    }

    #[test]
    fn images_by_their_bytes() {
        assert!(is_image(b"\x89PNG\r\n\x1a\nrest"));
        assert!(is_image(b"\xff\xd8\xff\xe0"));
        assert!(is_image(b"RIFF\0\0\0\0WEBPVP8 "));
        assert!(!is_image(b"<svg"));
    }

    #[test]
    fn tokens_are_long_and_url_safe() {
        let t = token().unwrap();
        assert_eq!(t.len(), 22);
        assert!(t.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_'));
        assert_ne!(t, token().unwrap());
    }

    #[test]
    fn page_has_no_placeholders_left() {
        for lang in ["zh", "en"] {
            let page = render_page(lang);
            assert!(!page.contains("__"), "{lang}");
        }
    }

    fn request(addr: SocketAddr, raw: &[u8]) -> String {
        let mut s = TcpStream::connect(addr).unwrap();
        s.write_all(raw).unwrap();
        let mut out = String::new();
        let _ = s.read_to_string(&mut out);
        out
    }

    #[test]
    fn upload_round_trip_on_loopback() {
        // SAFETY: this is the only test that reads or writes the environment.
        unsafe {
            std::env::set_var("KNOT_LAB_PHONE_HOST", "127.0.0.1");
            std::env::set_var("KNOT_LAB_PHONE_PORT", "0");
        }
        let h = Handoff::default();
        let code = h.start("lan", "en").unwrap();
        let rest = code.url.strip_prefix("http://").unwrap();
        let (addr, path) = rest.split_once('/').unwrap();
        let addr: SocketAddr = addr.parse().unwrap();
        assert!(request(addr, format!("GET /{path} HTTP/1.1\r\nHost: x\r\n\r\n").as_bytes()).starts_with("HTTP/1.1 200"));
        assert!(request(addr, b"GET /m/wrong HTTP/1.1\r\nHost: x\r\n\r\n").starts_with("HTTP/1.1 404"));
        let body = b"\xff\xd8\xff\xe0jpeg";
        let mut raw = format!("POST /{path} HTTP/1.1\r\nHost: x\r\nContent-Length: {}\r\n\r\n", body.len()).into_bytes();
        raw.extend_from_slice(body);
        assert!(request(addr, &raw).starts_with("HTTP/1.1 204"));
        let mut bad = format!("POST /{path} HTTP/1.1\r\nHost: x\r\nContent-Length: 4\r\n\r\n").into_bytes();
        bad.extend_from_slice(b"<svg");
        assert!(request(addr, &bad).starts_with("HTTP/1.1 415"));
        assert_eq!(h.take().unwrap(), body.to_vec());
        assert!(h.take().unwrap().is_empty());
        // Showing the code again keeps the same address, so a scanned phone keeps working.
        assert_eq!(h.start("lan", "en").unwrap().url, code.url);
        h.stop();
        assert!(h.take().is_err());
        h.shutdown();
    }
}
