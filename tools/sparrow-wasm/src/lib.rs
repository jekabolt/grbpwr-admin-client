//! Browser / Node entry point around sparrow's library API (single-threaded wasm).
//!
//! `solve(instance_json, seconds, seed, on_report)` runs sparrow on a jagua-rs SPP instance and
//! calls `on_report` with every feasible solution it reaches (ExplFeas, CmprFeas, Final).
use jagua_rs::Instant;
use jagua_rs::io::import::Importer;
use jagua_rs::probs::spp::entities::SPSolution;
use jagua_rs::probs::spp::io::ext_repr::ExtSPInstance;
use rand::SeedableRng;
use rand::rngs::Xoshiro256PlusPlus;
use sparrow::config::DEFAULT_SPARROW_CONFIG;
use sparrow::consts::{DEFAULT_COMPRESS_TIME_RATIO, DEFAULT_EXPLORE_TIME_RATIO};
use sparrow::optimizer::optimize;
use sparrow::util::listener::{ReportType, SolutionListener};
use sparrow::util::terminator::Terminator;
use std::time::Duration;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(typescript_type = "(report_json: string) => void")]
    pub type ReportFn;

    /// `fn.call(undefined, report_json)`; a JS exception comes back as `Err`.
    #[wasm_bindgen(method, structural, js_name = call, catch)]
    fn call(this: &ReportFn, ctx: &JsValue, report_json: &str) -> Result<JsValue, JsValue>;
}

struct JsReporter<'a> {
    start: Instant,
    on_report: &'a ReportFn,
}

impl SolutionListener for JsReporter<'_> {
    fn report(&mut self, report: ReportType, solution: &SPSolution) {
        let kind = match report {
            ReportType::ExplFeas => "ExplFeas",
            ReportType::CmprFeas => "CmprFeas",
            ReportType::Final => "Final",
            _ => return,
        };
        let msg = serde_json::json!({
            "kind": kind,
            "elapsed_sec": self.start.elapsed().as_secs_f32(),
            "strip_width": solution.strip_width(),
            "solution": jagua_rs::probs::spp::io::export(solution, self.start),
        });
        // A throwing callback must not stop the solver.
        let _ = self.on_report.call(&JsValue::UNDEFINED, &msg.to_string());
    }
}

/// Every phase timeout is capped by one wall-clock deadline (set at `solve` entry), so instance
/// import, the initial construction and phase overruns all come out of the same `seconds` budget.
struct DeadlineTerminator {
    deadline: Instant,
    timeout: Option<Instant>,
}

impl Terminator for DeadlineTerminator {
    fn kill(&self) -> bool {
        self.timeout.is_some_and(|t| Instant::now() > t)
    }

    fn new_timeout(&mut self, timeout: Duration) {
        self.timeout = Some((Instant::now() + timeout).min(self.deadline));
    }

    fn timeout_at(&self) -> Option<Instant> {
        self.timeout
    }
}

/// `seconds` is the whole wall-clock budget of this call (import included); `elapsed_sec` in the
/// reports and in the result counts from the moment `solve` was entered.
#[wasm_bindgen]
pub fn solve(instance_json: &str, seconds: f32, seed: u32, on_report: &ReportFn) -> Result<String, JsError> {
    let err = |e: anyhow::Error| JsError::new(&format!("{e:#}"));
    if !(seconds.is_finite() && seconds > 0.0) {
        return Err(JsError::new(&format!("seconds must be a positive number, got {seconds}")));
    }
    let start = Instant::now();
    let total = Duration::from_secs_f32(seconds);
    let mut config = DEFAULT_SPARROW_CONFIG;
    let ext: ExtSPInstance =
        serde_json::from_str(instance_json).map_err(|e| JsError::new(&format!("invalid instance json: {e}")))?;
    let importer = Importer::new(config.cde_config, config.poly_simpl_tolerance, config.narrow_concavity_cutoff_ratio);
    let instance = jagua_rs::probs::spp::io::import_instance(&importer, &ext).map_err(err)?;
    let left = total.saturating_sub(start.elapsed());
    config.expl_cfg.time_limit = left.mul_f32(DEFAULT_EXPLORE_TIME_RATIO);
    config.cmpr_cfg.time_limit = left.mul_f32(DEFAULT_COMPRESS_TIME_RATIO);
    let mut reporter = JsReporter { start, on_report };
    let mut terminator = DeadlineTerminator { deadline: start + total, timeout: None };
    let solution = optimize(
        instance,
        Xoshiro256PlusPlus::seed_from_u64(seed as u64),
        &mut reporter,
        &mut terminator,
        &config.expl_cfg,
        &config.cmpr_cfg,
        None,
    )
    .map_err(err)?;
    let out = serde_json::json!({
        "solution": jagua_rs::probs::spp::io::export(&solution, start),
        "elapsed_sec": start.elapsed().as_secs_f32(),
    });
    Ok(out.to_string())
}
