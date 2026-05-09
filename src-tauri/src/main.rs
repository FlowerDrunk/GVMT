fn main() {
    let is_cli_mode = is_pure_cli_command();

    if is_cli_mode {
        // Run as CLI mode — console is visible, stdout/stderr work naturally
        gvmt_lib::startup::execute_cli_command();
    } else {
        // GUI mode — hide the console window on Windows
        #[cfg(target_os = "windows")]
        gvmt_lib::windows::hide_console_window();

        if gvmt_lib::startup::execute_background_action() {
            return;
        }
        gvmt_lib::run();
    }
}

/// Check if the CLI arguments indicate a pure CLI command (no GUI needed).
fn is_pure_cli_command() -> bool {
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--gvmt-detect" | "--gvmt-status" | "--gvmt-update" => return true,
            "--help" | "-h" | "--version" | "-v" => return true,
            "--json" => return true, // --json implies a CLI command follows
            _ => continue,
        }
    }
    false
}
