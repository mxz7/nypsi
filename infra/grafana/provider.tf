provider "grafana" {
  url    = "https://grafana.maxz.dev"
  org_id = 1
}

data "grafana_data_source" "loki" {
  name = "loki"
}

resource "grafana_folder" "alerts" {
  uid                          = "nypsi-alerts"
  title                        = "nypsi alerts"
  prevent_destroy_if_not_empty = true
}
