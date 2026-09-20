---
name: grafana-alerts-as-code
description: Maintain nypsi's Terraform-managed Grafana alert rules, reusable query-alert module, Discord routing, Backblaze state, and GitHub Actions deployment. Use when adding, changing, diagnosing, or deploying alerts under infra/grafana.
---

# Grafana alerts as code

Alert definitions live in `infra/grafana/alerts.tf`. Reuse
`infra/grafana/modules/query-alert-group` instead of writing complete
`grafana_rule_group` resources for each alert. Add an entry to an existing module's
`alerts` map for another alert on the same datasource and service, or add a module
instance for a new service/group.

## Architecture

- Grafana is `https://grafana.maxz.dev`, organization `1`.
- Datasources are looked up by the stable names `loki` and `prometheus`; do not
  hardcode their generated UIDs.
- Rules are placed in the Terraform-managed folder with UID `nypsi-alerts`.
- The existing `discord staff` contact point is managed in Grafana, not Terraform.
  Rules reference it by name.
- Rule UIDs are deterministic: `<uid_prefix>-<alert_map_key>`, with underscores in
  the key replaced by hyphens. Choose stable, unique prefixes and keys; changing
  either replaces the rule identity.
- Query A reads Loki or Prometheus, expression B reduces each returned series, and
  expression C applies the threshold.

Prometheus vector labels are preserved through the reduce and threshold expressions.
An expression grouped by `instance` therefore creates one alert instance per host.
Notification grouping is by `alertname` and `grafana_folder`, so simultaneous host
instances can appear together in one Discord notification while remaining distinct
Grafana alert instances. Include `{{ $labels.instance }}` in host summaries and
descriptions.

## Important query-model constraint

Keep the Prometheus and Loki `jsonencode` models as separate conditional branches.
Do not merge maps whose corresponding values have different Terraform types. A mixed
conditional previously coerced Prometheus booleans to strings such as
`"instant":"true"`; Grafana rejected these because `instant` and `range` must be JSON
booleans. When changing the model, inspect the resulting JSON types, not only whether
Terraform validates.

Prometheus instant queries use native booleans `instant = true` and `range = false`.
Loki uses `queryType = "instant"`.

## State and deployment

Terraform state is stored in the private Backblaze B2 bucket
`maxz-terraform-state`, key `nypsi/grafana/terraform.tfstate`, through the S3-compatible
endpoint for `eu-central-003`. B2 does not support the conditional writes required by
Terraform's native S3 lockfile. Do not run concurrent applies; the GitHub Actions
workflow serializes them with the `grafana-alerts` concurrency group.

Pull requests touching `infra/grafana/**` or the Grafana workflow only validate.
Pushes to `main` and manual workflow dispatches validate, plan, and apply. Deployment
uses production environment secrets `GRAFANA_AUTH`, `B2_APPLICATION_KEY_ID`, and
`B2_APPLICATION_KEY`; credentials must not be committed or required for PR validation.

Commit `infra/grafana/.terraform.lock.hcl`. Do not commit `.terraform/`, state files,
or saved plans.

## Verification

After edits, run:

```bash
terraform -chdir=infra/grafana fmt -recursive
terraform -chdir=infra/grafana init -backend=false -input=false
terraform -chdir=infra/grafana validate
make check
```

Use the nypsi Grafana MCP for read-only inspection of deployed rules and datasource
queries when diagnosing runtime errors. A local validation does not prove Grafana will
accept the provider-generated query model. Production changes take effect only after
the workflow applies on `main`; then check rule health after at least one evaluation
interval.
