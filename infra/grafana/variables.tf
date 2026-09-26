variable "discord_webhook_url" {
  type        = string
  sensitive   = true
  description = "Webhook URL for the existing discord staff contact point."

  validation {
    condition     = startswith(var.discord_webhook_url, "https://")
    error_message = "discord_webhook_url must be a non-empty HTTPS URL."
  }
}
