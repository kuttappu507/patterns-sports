// PS-AMS :: desktop entry point — all shell logic lives in lib.rs
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    psams_lib::run()
}
