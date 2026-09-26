# Grafana alerts

Terraform manages Grafana alert rules and the existing `discord staff` contact point
for nypsi services. Each rule selects that contact point directly.

`notifications.tf` manages the Discord notification template and imports the existing
`discord staff` contact point into Terraform state. Its Discord Title and Message
fields use:

```text
{{ template "nypsi.discord.title" . }}
{{ template "nypsi.discord.message" . }}
```

The first line is the Title field and the second is the Message field. Set the
`DISCORD_STAFF_WEBHOOK_URL` secret in the `production` GitHub environment to the
existing Discord webhook URL before the first deployment. Terraform stores the URL
as sensitive state in the private Backblaze bucket. This replaces Grafana's verbose
default message with the alert summary and description.
The native Discord embed still links to the alert rule. The template handles grouped
and resolved alerts without adding a silence link.

Alert definitions live in `alerts.tf`. The reusable `modules/query-alert-group` module
adds the Grafana query, threshold expression, common labels, and notification settings.
Adding a service means adding another module instance; adding an alert means adding one
entry to that service's `alerts` map.

State is stored in the private Backblaze B2 bucket `maxz-terraform-state` at
`nypsi/grafana/terraform.tfstate`. Backblaze B2 does not support the conditional S3
writes required by Terraform's native lockfile, so applies must only run through the
serialized GitHub Actions workflow.

The `production` GitHub environment needs these secrets:

- `GRAFANA_AUTH`: Grafana service-account token with folder and alert provisioning access.
- `DISCORD_STAFF_WEBHOOK_URL`: Existing Discord webhook URL for `discord staff`.
- `B2_APPLICATION_KEY_ID`: ID of a bucket-restricted Backblaze application key.
- `B2_APPLICATION_KEY`: Secret for that application key.

Pull requests run `terraform fmt -check` and `terraform validate` without credentials.
Pushes to `main` that change this directory run `terraform plan` followed by
`terraform apply`.
