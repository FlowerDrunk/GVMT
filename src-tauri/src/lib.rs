pub mod command_exec;
pub mod commands;
pub mod db;
pub mod file_browser;
pub mod gh;
pub mod git;
pub mod ignore;
pub mod models;
pub mod quality;
pub mod startup;
pub mod svn;
pub mod utils;
pub mod windows;

pub fn run() {
    if !crate::windows::ensure_single_instance() {
        return;
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::add_ignore_rule,
            commands::add_repository,
            commands::check_gh_status,
            commands::check_remote_updates,
            commands::clear_operation_logs,
            commands::commit_repository,
            commands::consume_startup_context,
            commands::delete_repository,
            commands::detect_repository,
            commands::get_windows_context_menu_status,
            commands::get_gh_repo_info,
            commands::get_ignore_rules,
            commands::get_repository_diff,
            commands::get_repository_status,
            commands::gh_list_actions,
            commands::gh_list_directory,
            commands::gh_list_prs,
            commands::gh_open_browser,
            commands::gh_read_file,
            commands::install_windows_context_menu,
            commands::list_branches,
            commands::list_operation_logs,
            commands::list_quality_checks,
            commands::list_repositories,
            commands::list_repository_files,
            commands::log_operation,
            commands::open_svn_cli_download_page,
            commands::parse_remote_owner_repo,
            commands::pick_folder,
            commands::read_repository_file,
            commands::refresh_repository,
            commands::run_quality_check,
            commands::svn_remote_cat,
            commands::svn_remote_list,
            commands::switch_branch,
            commands::uninstall_windows_context_menu,
            commands::update_gitignore,
            commands::update_repository,
            commands::update_svn_ignore,
        ])
        .run(tauri::generate_context!())
        .expect("error while running GVMT");
}
