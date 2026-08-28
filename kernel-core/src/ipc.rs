pub struct IpcMessage {
    pub sender_id: u32,
    pub payload: String,
}

pub struct IpcChannel {
    pub channel_name: &'static str,
    pub is_active: bool,
}

pub fn create_sovereign_ipc_channel() -> IpcChannel {
    IpcChannel {
        channel_name: "\\\\.\\pipe\\BharatOS_Kernel_IPC_Bus",
        is_active: true,
    }
}
