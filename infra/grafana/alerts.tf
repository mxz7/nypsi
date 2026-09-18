module "nypsi_log_alerts" {
  source = "./modules/log-alert-group"

  service        = "nypsi"
  folder_uid     = grafana_folder.alerts.uid
  datasource_uid = data.grafana_data_source.loki.uid
  contact_point  = "discord staff"

  alerts = {
    error_burst = {
      title         = "nypsi error burst"
      expression    = "sum(count_over_time({service_name=\"nypsi\", level=\"error\"}[5m]))"
      range_seconds = 300
      threshold     = 2
      pending_for   = "1m"
      summary       = "nypsi error logs are arriving unusually quickly"
      description   = "nypsi logged at least three errors in a rolling five-minute window."
    }

    logs_absent = {
      title           = "nypsi logs absent"
      expression      = "sum(absent_over_time({service_name=\"nypsi\"}[10m]))"
      range_seconds   = 600
      threshold       = 0
      pending_for     = "5m"
      severity        = "critical"
      summary         = "nypsi appears to have stopped logging"
      description     = "Loki has received no nypsi logs for at least ten minutes."
      repeat_interval = "1h"
    }
  }
}
