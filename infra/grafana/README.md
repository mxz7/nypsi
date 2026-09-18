# Grafana alerts

Terraform manages Grafana alert rules for nypsi services. The existing `discord staff`
contact point remains managed in Grafana and is selected directly by each rule.

Alert definitions live in `alerts.tf`. The reusable `modules/log-alert-group` module
adds the Grafana query, threshold expression, common labels, and notification settings.
Adding a service means adding another module instance; adding an alert means adding one
entry to that service's `alerts` map.

State is stored in the private Backblaze B2 bucket `maxz-terraform-state` at
`nypsi/grafana/terraform.tfstate`. Backblaze B2 does not support the conditional S3
writes required by Terraform's native lockfile, so applies must only run through the
serialized GitHub Actions workflow.

The `production` GitHub environment needs these secrets:

- `GRAFANA_AUTH`: Grafana service-account token with folder and alert provisioning access.
- `B2_APPLICATION_KEY_ID`: ID of a bucket-restricted Backblaze application key.
- `B2_APPLICATION_KEY`: Secret for that application key.

Pull requests run `terraform fmt -check` and `terraform validate` without credentials.
Pushes to `main` that change this directory run `terraform plan` followed by
`terraform apply`.
