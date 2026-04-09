variable "REGISTRY" { default = "" }
variable "TAG" { default = "latest" }

function "tag" {
  params = [name]
  result = REGISTRY != "" ? ["${REGISTRY}/${name}:${TAG}"] : ["${name}:${TAG}"]
}

group "default" {
  targets = ["api", "web"]
}

target "api" {
  context    = "."
  dockerfile = "DarkUxChallenge.Api/Dockerfile"
  tags       = tag("darkux")
  platforms  = ["linux/amd64", "linux/arm64"]
  cache-from = ["type=gha,scope=darkux-api"]
  cache-to   = ["type=gha,mode=max,scope=darkux-api"]
}

target "web" {
  context    = "DarkUxChallenge.SPA.Web"
  dockerfile = "Dockerfile"
  tags       = tag("darkux-web")
  platforms  = ["linux/amd64", "linux/arm64"]
  cache-from = ["type=gha,scope=darkux-web"]
  cache-to   = ["type=gha,mode=max,scope=darkux-web"]
}
