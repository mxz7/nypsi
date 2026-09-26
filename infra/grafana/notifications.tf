resource "grafana_message_template" "discord" {
  name     = "nypsi discord alerts"
  template = file("${path.module}/discord.tmpl")
}

import {
  to = grafana_contact_point.discord_staff
  id = "1:discord staff"
}

resource "grafana_contact_point" "discord_staff" {
  name               = "discord staff"
  disable_provenance = true

  discord {
    url                  = var.discord_webhook_url
    title                = "{{ template \"nypsi.discord.title\" . }}"
    message              = "{{ template \"nypsi.discord.message\" . }}"
    use_discord_username = true
  }

  depends_on = [grafana_message_template.discord]

  lifecycle {
    prevent_destroy = true
  }
}
