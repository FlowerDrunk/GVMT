#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if gvmt_lib::execute_background_action() {
        return;
    }
    gvmt_lib::run();
}
