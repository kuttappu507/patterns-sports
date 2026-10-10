// ============================================================
// PS-AMS :: native printing (WebView2 print pipeline)
// Clicking Print must NOT open the browser-style print dialog:
// the app renders the document into the hidden #psams-print-root
// (print CSS already hides the whole UI), then invokes
// `print_direct` which drives WebView2's ICoreWebView2_16::Print
// with an in-app paper preset (A6 receipts / A4 rosters / 80 mm
// slip) straight to the DEFAULT printer — silent, exact size,
// zero margins, no headers or footers.
//
// `print_to_pdf` uses ICoreWebView2_7::PrintToPdf with the same
// preset so a saved PDF is a TRUE single-page document at the
// chosen paper size (never A6-looking content on an A4 sheet).
//
// API surface verified against webview2-com 0.39 (the same
// version tauri 2.12 / wry 0.57 resolve to):
//   - tauri::Webview::with_webview → PlatformWebview::{controller, environment}
//   - ICoreWebView2Environment6::CreatePrintSettings
//   - ICoreWebView2PrintSettings (page size, margins, backgrounds)
//   - ICoreWebView2_16::Print + PrintCompletedHandler
//   - ICoreWebView2_7::PrintToPdf + PrintToPdfCompletedHandler
// ============================================================

/// Paper presets understood by the print commands — (width, height) inches.
/// A6 is the academy receipt preset (105 × 148 mm).
pub fn paper_dimensions(paper: &str) -> (f64, f64) {
    match paper {
        "A5" => (5.83, 8.27),
        "A4" => (8.27, 11.69),
        // 80 mm POS roll: narrow page, long enough for the whole slip
        "Thermal80" => (3.15, 11.69),
        _ => (4.13, 5.83), // A6
    }
}

#[derive(Debug)]
pub enum PrintTarget {
    /// Silent print to the system default printer.
    Printer,
    /// Render to a PDF file at the exact paper size.
    PdfFile(String),
}

/// Where the result of the print job is reported to the awaiting command.
type PrintResultTx = std::sync::mpsc::Sender<Result<String, String>>;

/// Run a print job on the main thread (called inside with_webview).
/// Sends exactly one result through `tx` when the job completes or fails.
pub fn run_print_job(
    webview: &tauri::webview::PlatformWebview,
    paper: &str,
    target: PrintTarget,
    tx: PrintResultTx,
) {
    #[cfg(windows)]
    {
        use webview2_com::Microsoft::Web::WebView2::Win32::*;
        use windows_core::Interface as _;

        let tx_err = tx.clone();
        let outcome: windows_core::Result<()> = unsafe {
            (|| {
                let controller = webview.controller();
                let core = controller.CoreWebView2()?;
                let env = webview.environment();
                let env6: ICoreWebView2Environment6 = env.cast()?;
                let settings = env6.CreatePrintSettings()?;

                let (w, h) = paper_dimensions(paper);
                settings.SetPageWidth(w)?;
                settings.SetPageHeight(h)?;
                settings.SetOrientation(COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT)?;
                settings.SetScaleFactor(1.0)?;
                settings.SetMarginTop(0.0)?;
                settings.SetMarginBottom(0.0)?;
                settings.SetMarginLeft(0.0)?;
                settings.SetMarginRight(0.0)?;
                settings.SetShouldPrintBackgrounds(true.into())?;
                settings.SetShouldPrintSelectionOnly(false.into())?;
                settings.SetShouldPrintHeaderAndFooter(false.into())?;

                match target {
                    PrintTarget::Printer => {
                        // ICoreWebView2_16 needs an evergreen WebView2 Runtime
                        // (1.0.2210.55+, Dec 2023). Cast failure = old runtime.
                        let wv16: ICoreWebView2_16 = core.cast()?;
                        let handler = PrintCompletedHandler::create(Box::new(move |res, status| {
                            let ok = res.is_ok() && status.0 == COREWEBVIEW2_PRINT_STATUS_SUCCEEDED.0;
                            let _ = tx.send(if ok {
                                Ok("Sent to your default printer".into())
                            } else {
                                Err("Printing failed — check that a printer is connected and set as the Windows default".into())
                            });
                            Ok(())
                        }));
                        wv16.Print(&settings, &handler)?;
                    }
                    PrintTarget::PdfFile(path) => {
                        let wv7: ICoreWebView2_7 = core.cast()?;
                        let path_h: windows_core::HSTRING = path.into();
                        let handler = PrintToPdfCompletedHandler::create(Box::new(move |res, ok| {
                            let _ = tx.send(if res.is_ok() && ok {
                                Ok("PDF written".into())
                            } else {
                                Err("Could not write the PDF file — is the folder writable?".into())
                            });
                            Ok(())
                        }));
                        wv7.PrintToPdf(PCWSTR::from_raw(path_h.as_ptr()), &settings, &handler)?;
                    }
                }
                Ok(())
            })()
        };

        if let Err(e) = outcome {
            let _ = tx_err.send(Err(format!(
                "Native printing is unavailable: {e}. Try updating the WebView2 Runtime, or use the PDF button."
            )));
        }
    }

    #[cfg(not(windows))]
    {
        let _ = (webview, paper);
        let _ = tx.send(Err("Native printing is only available in the Windows desktop app".into()));
    }
}

fn wait_for_print(
    rx: std::sync::mpsc::Receiver<Result<String, String>>,
) -> impl Future<Output = Result<String, String>> + Send {
    async move {
        let recv = tauri::async_runtime::spawn_blocking(move || {
            rx.recv_timeout(std::time::Duration::from_secs(60))
        })
        .await
        .map_err(|e| format!("Print task failed: {e}"))?;
        match recv {
            Ok(res) => res,
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                Err("Print could not be started in this window".into())
            }
            Err(_) => Err("The printer did not respond in time — check the printer connection".into()),
        }
    }
}

use std::future::Future;

/// Silent print of the current document (already rendered into
/// #psams-print-root with print CSS applied) at the given paper preset.
#[tauri::command]
pub async fn print_direct(window: tauri::WebviewWindow, paper: String) -> Result<String, String> {
    let (tx, rx) = std::sync::mpsc::channel::<Result<String, String>>();
    window
        .with_webview(move |webview| run_print_job(&webview, &paper, PrintTarget::Printer, tx))
        .map_err(|e| format!("Webview unavailable: {e}"))?;
    wait_for_print(rx).await
}

/// Render the current document to a PDF file at the exact paper size.
#[tauri::command]
pub async fn print_to_pdf(window: tauri::WebviewWindow, paper: String, path: String) -> Result<String, String> {
    if path.trim().is_empty() {
        return Err("No destination file was chosen".into());
    }
    let (tx, rx) = std::sync::mpsc::channel::<Result<String, String>>();
    let dest = path.clone();
    window
        .with_webview(move |webview| run_print_job(&webview, &paper, PrintTarget::PdfFile(dest), tx))
        .map_err(|e| format!("Webview unavailable: {e}"))?;
    wait_for_print(rx).await?;
    Ok(path)
}
