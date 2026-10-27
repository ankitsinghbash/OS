use std::time::Instant;

// ── RDTSC: Direct CPU Hardware Clock — No Windows API involved ────────────────
// ye instruction seedha CPU ke hardware timestamp counter register se padhta hai
// Windows, Linux, koi bhi OS is instruction ko intercept nahi kar sakta!
#[cfg(target_arch = "x86_64")]
#[inline(always)]
unsafe fn rdtsc() -> u64 {
    let lo: u32;
    let hi: u32;
    std::arch::asm!(
        "rdtsc",
        out("eax") lo,
        out("edx") hi,
        options(nostack, nomem, preserves_flags)
    );
    ((hi as u64) << 32) | (lo as u64)
}

pub struct TrueHardwareReport {
    pub cpu_clock_ghz: f64,
    pub rdtsc_cycles_per_ns: f64,
    pub syscall_overhead_ns: f64,
    pub pure_compute_ns_per_op: f64,
    pub windows_tax_ns: f64,
    pub windows_tax_percent: f64,
    pub cache_latency_l1_ns: f64,
    pub cache_latency_ram_ns: f64,
}

pub fn run_true_hardware_test() -> TrueHardwareReport {

    // ── 1. Measure actual CPU GHz using RDTSC vs wall clock ───────────────────
    let wall_start = Instant::now();
    let rdtsc_start = unsafe { rdtsc() };

    // Spin for exactly 10ms
    let mut sink: u64 = 1;
    while wall_start.elapsed().as_millis() < 10 {
        sink = sink.wrapping_mul(6364136223846793005);
    }
    let _ = sink;

    let rdtsc_end = unsafe { rdtsc() };
    let wall_elapsed_ns = wall_start.elapsed().as_nanos() as f64;
    let rdtsc_delta = (rdtsc_end - rdtsc_start) as f64;

    let cycles_per_ns = rdtsc_delta / wall_elapsed_ns;
    let cpu_ghz = cycles_per_ns; // 1 cycle/ns = 1 GHz

    // ── 2. Pure compute: how fast is 1 CPU operation WITHOUT any OS call? ─────
    let compute_start_rdtsc = unsafe { rdtsc() };
    let iters = 10_000_000u64;
    let mut acc: u64 = 0xDEADBEEF;
    for i in 0..iters {
        acc = acc.wrapping_mul(6364136223846793005).wrapping_add(i);
    }
    let _ = acc;
    let compute_end_rdtsc = unsafe { rdtsc() };
    let compute_cycles = (compute_end_rdtsc - compute_start_rdtsc) as f64;
    let ns_per_op = (compute_cycles / iters as f64) / cycles_per_ns;

    // ── 3. Measure Windows syscall overhead (each OS API call cost in ns) ─────
    // We call GetSystemTimeAsFileTime which is one of the cheapest Windows syscalls
    let syscall_iters = 100_000;
    let syscall_start_rdtsc = unsafe { rdtsc() };
    for _ in 0..syscall_iters {
        unsafe {
            let _ft = windows::Win32::System::SystemInformation::GetSystemTimeAsFileTime();
        }
    }
    let syscall_end_rdtsc = unsafe { rdtsc() };
    let syscall_cycles_each = (syscall_end_rdtsc - syscall_start_rdtsc) as f64 / syscall_iters as f64;
    let syscall_ns = syscall_cycles_each / cycles_per_ns;

    // ── 4. L1 Cache latency — direct pointer chase (no OS involved) ───────────
    let cache_size = 32 * 1024usize; // 32KB = fits in L1 cache
    let mut l1_data = vec![0usize; cache_size / 8];
    for i in 0..l1_data.len() {
        l1_data[i] = (i + 1) % l1_data.len();
    }
    let l1_iters = 1_000_000usize;
    let l1_start = unsafe { rdtsc() };
    let mut ptr = 0usize;
    for _ in 0..l1_iters {
        ptr = l1_data[ptr];
    }
    let _ = ptr;
    let l1_end = unsafe { rdtsc() };
    let l1_cycles_each = (l1_end - l1_start) as f64 / l1_iters as f64;
    let l1_ns = l1_cycles_each / cycles_per_ns;

    // ── 5. RAM latency — pointer chase in 256MB (forces cache miss → DRAM) ────
    let ram_size = 256 * 1024 * 1024usize / 8; // 256MB
    let mut ram_data = vec![0usize; ram_size];
    // Stride by 4KB to bypass prefetcher
    let stride = 512usize;
    for i in 0..ram_data.len() {
        ram_data[i] = (i + stride) % ram_data.len();
    }
    let ram_iters = 10_000usize;
    let ram_start = unsafe { rdtsc() };
    let mut rptr = 0usize;
    for _ in 0..ram_iters {
        rptr = ram_data[rptr];
    }
    let _ = rptr;
    let ram_end = unsafe { rdtsc() };
    let ram_cycles_each = (ram_end - ram_start) as f64 / ram_iters as f64;
    let ram_ns = ram_cycles_each / cycles_per_ns;

    // ── 6. Windows "tax" calculation ──────────────────────────────────────────
    // Each Windows syscall costs X ns — pure compute only costs Y ns
    // The difference IS the Windows layer overhead
    let windows_tax_ns = syscall_ns - ns_per_op;
    let windows_tax_pct = (windows_tax_ns / syscall_ns) * 100.0;

    TrueHardwareReport {
        cpu_clock_ghz: cpu_ghz,
        rdtsc_cycles_per_ns: cycles_per_ns,
        syscall_overhead_ns: syscall_ns,
        pure_compute_ns_per_op: ns_per_op,
        windows_tax_ns,
        windows_tax_percent: windows_tax_pct,
        cache_latency_l1_ns: l1_ns,
        cache_latency_ram_ns: ram_ns,
    }
}
