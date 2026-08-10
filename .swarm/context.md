

## Agent Activity

| Tool | Calls | Success | Failed | Avg Duration |
|------|-------|---------|--------|--------------|
| read | 213 | 213 | 0 | 1794ms |
| glob | 55 | 55 | 0 | 557ms |
| grep | 51 | 51 | 0 | 13109ms |
| bash | 36 | 36 | 0 | 4678ms |
| arise_summon | 18 | 18 | 0 | 1117952ms |
| task | 14 | 14 | 0 | 1105702ms |
| edit | 13 | 13 | 0 | 166ms |
| websearch | 12 | 12 | 0 | 2472ms |
| todowrite | 7 | 7 | 0 | 14ms |
| save_plan | 7 | 7 | 0 | 327ms |
| update_task_status | 6 | 6 | 0 | 49ms |
| web_search | 4 | 4 | 0 | 11ms |
| spec_write | 3 | 3 | 0 | 34ms |
| declare_scope | 3 | 3 | 0 | 129ms |
| arise_git_summary | 2 | 2 | 0 | 404ms |
| arise_background_status | 2 | 2 | 0 | 44ms |
| google_search | 2 | 2 | 0 | 8ms |
| set_qa_gates | 2 | 2 | 0 | 812ms |
| get_approved_plan | 2 | 2 | 0 | 7ms |
| arise_background | 1 | 1 | 0 | 240ms |
| arise_background_output | 1 | 1 | 0 | 3ms |
| arise_list_models | 1 | 1 | 0 | 1170ms |
| invalid | 1 | 1 | 0 | 2ms |
| web_fetch | 1 | 1 | 0 | 12ms |
| webfetch | 1 | 1 | 0 | 7863ms |
| checkpoint | 1 | 1 | 0 | 5901ms |
| write | 1 | 1 | 0 | 98ms |
| arise_continue | 1 | 1 | 0 | 38ms |
| get_qa_gate_profile | 1 | 1 | 0 | 22ms |
## Pending QA Gate Selection

Decision (user, via architect): balanced-speed defaults — reviewer ON, test_engineer ON, sme_enabled ON, critic_pre_plan ON, sast_enabled ON, drift_check ON; council_mode, hallucination_guard, mutation_test, phase_council, final_council OFF. Authorized to call set_qa_gates with these flags and proceed with save_plan.
