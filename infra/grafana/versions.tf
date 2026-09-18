terraform {
  required_version = "~> 1.16.0"

  required_providers {
    grafana = {
      source  = "grafana/grafana"
      version = "~> 4.44.0"
    }
  }

  backend "s3" {
    bucket = "maxz-terraform-state"
    key    = "nypsi/grafana/terraform.tfstate"
    region = "eu-central-003"

    endpoints = {
      s3 = "https://s3.eu-central-003.backblazeb2.com"
    }

    encrypt                     = true
    use_path_style              = true
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
  }
}
