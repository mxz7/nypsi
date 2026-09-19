variable "group_name" {
  type = string
}

variable "uid_prefix" {
  type = string
}

variable "folder_uid" {
  type = string
}

variable "datasource_uid" {
  type = string
}

variable "datasource_type" {
  type = string
}

variable "contact_point" {
  type = string
}

variable "common_labels" {
  type    = map(string)
  default = {}
}

variable "evaluation_interval_seconds" {
  type    = number
  default = 60
}

variable "alerts" {
  type = map(object({
    title           = string
    expression      = string
    range_seconds   = number
    threshold       = number
    evaluator       = optional(string, "gt")
    pending_for     = optional(string, "0s")
    severity        = optional(string, "warning")
    summary         = string
    description     = string
    repeat_interval = optional(string, "4h")
    no_data_state   = optional(string, "OK")
    exec_err_state  = optional(string, "Alerting")
    labels          = optional(map(string), {})
  }))
}
