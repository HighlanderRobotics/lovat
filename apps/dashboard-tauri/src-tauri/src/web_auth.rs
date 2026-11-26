//! Auth0 sign-in through Apple's in-app authentication sheet
//! (ASWebAuthenticationSession), the same mechanism auth0_flutter uses.
//!
//! The session opens the authorize URL in a system sheet that shares Safari's
//! cookies, and returns the redirect itself when the page navigates to
//! `callback_scheme://...`. No system-wide deep link is involved, so it works
//! the same in `tauri dev`, unbundled builds, macOS, and iOS.

use std::cell::RefCell;
use std::sync::mpsc;

use block2::RcBlock;
use objc2::rc::Retained;
#[cfg(target_os = "ios")]
use objc2::runtime::AnyObject;
use objc2::runtime::ProtocolObject;
use objc2::{define_class, msg_send, AllocAnyThread, DefinedClass, MainThreadMarker, MainThreadOnly};
use objc2_authentication_services::{
    ASPresentationAnchor, ASWebAuthenticationPresentationContextProviding, ASWebAuthenticationSession,
};
use objc2_foundation::{NSError, NSObject, NSObjectProtocol, NSString, NSURL};
use tauri::{AppHandle, Manager, Runtime};

pub struct PresenterIvars {
    window: Retained<NSObject>,
}

define_class!(
    // SAFETY: NSObject has no subclassing requirements and Presenter has no Drop.
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[name = "LovatAuthPresenter"]
    #[ivars = PresenterIvars]
    struct Presenter;

    unsafe impl NSObjectProtocol for Presenter {}

    // Objective-C requires this method on both platforms, even though the
    // Rust bindings only declare it for macOS.
    unsafe impl ASWebAuthenticationPresentationContextProviding for Presenter {
        #[unsafe(method_id(presentationAnchorForWebAuthenticationSession:))]
        fn anchor(&self, _session: &ASWebAuthenticationSession) -> Retained<ASPresentationAnchor> {
            self.ivars().window.clone()
        }
    }
);

impl Presenter {
    fn new(mtm: MainThreadMarker, window: Retained<NSObject>) -> Retained<Self> {
        let this = Self::alloc(mtm).set_ivars(PresenterIvars { window });
        unsafe { msg_send![super(this), init] }
    }
}

thread_local! {
    /// Keeps the running session and its presenter alive until it finishes.
    static ACTIVE: RefCell<Option<(Retained<ASWebAuthenticationSession>, Retained<Presenter>)>> =
        const { RefCell::new(None) };
}

/// The native window to present over: NSWindow on macOS, UIWindow on iOS.
fn native_window<R: Runtime>(app: &AppHandle<R>) -> Result<Retained<NSObject>, String> {
    let webview = app.get_webview_window("main").ok_or("No main window")?;
    #[cfg(target_os = "macos")]
    let raw = webview.ns_window().map_err(|e| e.to_string())? as *mut NSObject;
    #[cfg(target_os = "ios")]
    let raw = {
        let (tx, rx) = mpsc::channel();
        webview
            .with_webview(move |wv| {
                let vc = wv.view_controller() as *mut AnyObject;
                let window: *mut NSObject = unsafe {
                    let view: *mut AnyObject = msg_send![vc, view];
                    msg_send![view, window]
                };
                let _ = tx.send(window as usize);
            })
            .map_err(|e| e.to_string())?;
        rx.recv().map_err(|e| e.to_string())? as *mut NSObject
    };
    unsafe { Retained::retain(raw) }.ok_or_else(|| "The app window is not available".to_string())
}

/// Opens `url` in the authentication sheet and resolves with the callback URL.
#[tauri::command]
pub async fn web_auth<R: Runtime>(app: AppHandle<R>, url: String, callback_scheme: String) -> Result<String, String> {
    let (tx, rx) = mpsc::channel::<Result<String, String>>();
    let handle = app.clone();
    app.run_on_main_thread(move || {
        let start = || -> Result<(), String> {
            let mtm = MainThreadMarker::new().ok_or("Not on the main thread")?;
            let window = native_window(&handle)?;
            let ns_url = NSURL::URLWithString(&NSString::from_str(&url)).ok_or("Invalid sign-in URL")?;
            let scheme = NSString::from_str(&callback_scheme);
            let done = tx.clone();
            let completion = RcBlock::new(move |callback: *mut NSURL, error: *mut NSError| {
                let result = match (unsafe { callback.as_ref() }, unsafe { error.as_ref() }) {
                    (Some(url), _) => url
                        .absoluteString()
                        .map(|s| s.to_string())
                        .ok_or_else(|| "Sign-in returned an empty URL".to_string()),
                    // Code 1 is ASWebAuthenticationSessionErrorCodeCanceledLogin.
                    (None, Some(err)) if err.code() == 1 => Err("Sign-in was cancelled".to_string()),
                    (None, Some(err)) => Err(err.localizedDescription().to_string()),
                    (None, None) => Err("Sign-in failed".to_string()),
                };
                let _ = done.send(result);
                ACTIVE.with(|active| active.borrow_mut().take());
            });
            #[allow(deprecated)]
            let session = unsafe {
                ASWebAuthenticationSession::initWithURL_callbackURLScheme_completionHandler(
                    ASWebAuthenticationSession::alloc(),
                    &ns_url,
                    Some(&scheme),
                    RcBlock::as_ptr(&completion),
                )
            };
            let presenter = Presenter::new(mtm, window);
            unsafe {
                session.setPresentationContextProvider(Some(ProtocolObject::from_ref(&*presenter)));
                // Share Safari's cookies so an existing Auth0 login is reused.
                session.setPrefersEphemeralWebBrowserSession(false);
            }
            if !unsafe { session.start() } {
                return Err("Could not open the sign-in sheet".to_string());
            }
            ACTIVE.with(|active| *active.borrow_mut() = Some((session, presenter)));
            Ok(())
        };
        if let Err(e) = start() {
            let _ = tx.send(Err(e));
        }
    })
    .map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || rx.recv().map_err(|e| e.to_string())?)
        .await
        .map_err(|e| e.to_string())?
}
