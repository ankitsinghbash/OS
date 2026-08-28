#[cfg(windows)]
pub mod display;
#[cfg(windows)]
pub mod power;
#[cfg(windows)]
pub mod memory;
#[cfg(windows)]
pub mod process;
#[cfg(windows)]
pub mod storage;
#[cfg(windows)]
pub mod network;
#[cfg(windows)]
pub mod security;
pub mod ipc;
#[cfg(windows)]
pub mod stress;
#[cfg(windows)]
pub mod gui;
pub mod hft;
pub mod algo_trader;
pub mod paper_trader;
pub mod live_feed;
#[cfg(windows)]
pub mod ipc_server;
pub mod binance_auth;
pub mod live_real_trader;
