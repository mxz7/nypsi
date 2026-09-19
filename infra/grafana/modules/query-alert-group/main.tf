locals {
  expression_datasource = {
    type = "__expr__"
    uid  = "__expr__"
  }

  query_datasource = {
    type = var.datasource_type
    uid  = var.datasource_uid
  }
}

resource "grafana_rule_group" "this" {
  name             = var.group_name
  folder_uid       = var.folder_uid
  interval_seconds = var.evaluation_interval_seconds

  dynamic "rule" {
    for_each = var.alerts

    content {
      uid            = "${var.uid_prefix}-${replace(rule.key, "_", "-")}"
      name           = rule.value.title
      condition      = "C"
      for            = rule.value.pending_for
      no_data_state  = rule.value.no_data_state
      exec_err_state = rule.value.exec_err_state
      is_paused      = false

      annotations = {
        description = rule.value.description
        summary     = rule.value.summary
      }

      labels = merge(
        {
          managed_by = "terraform"
          severity   = rule.value.severity
        },
        var.common_labels,
        rule.value.labels,
      )

      notification_settings {
        contact_point   = var.contact_point
        group_by        = ["alertname", "grafana_folder"]
        group_wait      = "30s"
        group_interval  = "5m"
        repeat_interval = rule.value.repeat_interval
      }

      data {
        ref_id         = "A"
        datasource_uid = var.datasource_uid

        relative_time_range {
          from = rule.value.range_seconds
          to   = 0
        }

        model = jsonencode(merge(
          {
            datasource    = local.query_datasource
            editorMode    = "code"
            expr          = rule.value.expression
            intervalMs    = 1000
            maxDataPoints = 43200
            refId         = "A"
          },
          var.datasource_type == "prometheus" ? {
            instant      = true
            legendFormat = "__auto"
            range        = false
            } : {
            queryType = "instant"
          },
        ))
      }

      data {
        ref_id         = "B"
        datasource_uid = "__expr__"

        relative_time_range {
          from = 0
          to   = 0
        }

        model = jsonencode({
          conditions = [
            {
              evaluator = {
                params = []
                type   = "gt"
              }
              operator = {
                type = "and"
              }
              query = {
                params = ["B"]
              }
              reducer = {
                params = []
                type   = "last"
              }
              type = "query"
            }
          ]
          datasource    = local.expression_datasource
          expression    = "A"
          intervalMs    = 1000
          maxDataPoints = 43200
          reducer       = "last"
          refId         = "B"
          type          = "reduce"
        })
      }

      data {
        ref_id         = "C"
        datasource_uid = "__expr__"

        relative_time_range {
          from = 0
          to   = 0
        }

        model = jsonencode({
          conditions = [
            {
              evaluator = {
                params = [rule.value.threshold]
                type   = rule.value.evaluator
              }
              operator = {
                type = "and"
              }
              query = {
                params = ["C"]
              }
              reducer = {
                params = []
                type   = "last"
              }
              type = "query"
            }
          ]
          datasource    = local.expression_datasource
          expression    = "B"
          intervalMs    = 1000
          maxDataPoints = 43200
          refId         = "C"
          type          = "threshold"
        })
      }
    }
  }
}
