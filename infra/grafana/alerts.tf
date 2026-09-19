module "nypsi_log_alerts" {
  source = "./modules/query-alert-group"

  group_name      = "nypsi logs"
  uid_prefix      = "nypsi"
  folder_uid      = grafana_folder.alerts.uid
  datasource_uid  = data.grafana_data_source.loki.uid
  datasource_type = "loki"
  contact_point   = "discord staff"

  common_labels = {
    service = "nypsi"
    source  = "loki"
  }

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

module "system_resource_alerts" {
  source = "./modules/query-alert-group"

  group_name      = "system resources"
  uid_prefix      = "system"
  folder_uid      = grafana_folder.alerts.uid
  datasource_uid  = data.grafana_data_source.prometheus.uid
  datasource_type = "prometheus"
  contact_point   = "discord staff"

  common_labels = {
    service = "infrastructure"
    source  = "prometheus"
  }

  alerts = {
    cpu_high = {
      title           = "host CPU usage high"
      expression      = "100 * (1 - avg by (instance) (rate(node_cpu_seconds_total{instance=~\"grimes|eugene|dixon\", mode=\"idle\"}[5m])))"
      range_seconds   = 300
      threshold       = 90
      pending_for     = "10m"
      severity        = "warning"
      summary         = "{{ $labels.instance }} CPU usage is high"
      description     = "CPU usage on {{ $labels.instance }} has exceeded 90% for ten minutes."
      repeat_interval = "2h"
    }

    memory_high = {
      title           = "host memory usage high"
      expression      = "100 * (1 - (node_memory_MemAvailable_bytes{instance=~\"grimes|eugene|dixon\"} / node_memory_MemTotal_bytes{instance=~\"grimes|eugene|dixon\"}))"
      range_seconds   = 300
      threshold       = 90
      pending_for     = "10m"
      severity        = "warning"
      summary         = "{{ $labels.instance }} memory usage is high"
      description     = "Memory usage on {{ $labels.instance }} has exceeded 90% for ten minutes."
      repeat_interval = "2h"
    }

    disk_high = {
      title           = "host root disk usage high"
      expression      = "100 * (1 - (node_filesystem_avail_bytes{instance=~\"grimes|eugene|dixon\", mountpoint=\"/\"} / node_filesystem_size_bytes{instance=~\"grimes|eugene|dixon\", mountpoint=\"/\"}))"
      range_seconds   = 300
      threshold       = 85
      pending_for     = "15m"
      severity        = "warning"
      summary         = "{{ $labels.instance }} root disk usage is high"
      description     = "Root disk usage on {{ $labels.instance }} has exceeded 85% for fifteen minutes."
      repeat_interval = "4h"
    }
  }
}
