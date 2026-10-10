{{- define "vardiya.name" -}}
{{- default .Chart.Name .Values.global.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end }}

{{- define "vardiya.fullname" -}}
{{- if .Values.global.fullnameOverride -}}
{{- .Values.global.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.global.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end }}

{{- define "vardiya.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end }}

{{- define "vardiya.labels" -}}
helm.sh/chart: {{ include "vardiya.chart" . }}
app.kubernetes.io/name: {{ include "vardiya.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: vardiya
{{- end }}

{{- define "vardiya.selectorLabels" -}}
app.kubernetes.io/name: {{ include "vardiya.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "vardiya.imagePullSecrets" -}}
{{- if .Values.global.imagePullSecrets }}
imagePullSecrets:
{{- range .Values.global.imagePullSecrets }}
  - name: {{ . }}
{{- end }}
{{- end }}
{{- end }}

{{- define "vardiya.registry" -}}
{{- if .Values.global.registry }}{{ .Values.global.registry }}/{{ end -}}
{{- end }}

{{- define "vardiya.postgres.url" -}}
{{- $user := .Values.postgres.existingUser | default "vardiya" -}}
{{- $host := printf "%s-postgres" .Release.Name -}}
{{- $port := "5432" -}}
{{- $db := "vardiyasystem" -}}
{{- printf "postgresql://%s:$(POSTGRES_PASSWORD)@%s:%s/%s" $user $host $port $db -}}
{{- end }}

{{- define "vardiya.pgbouncer.url" -}}
{{- $user := "vardiya" -}}
{{- $host := printf "%s-pgbouncer" .Release.Name -}}
{{- $port := "6432" -}}
{{- $db := "vardiyasystem" -}}
{{- printf "postgresql://%s:$(POSTGRES_PASSWORD)@%s:%s/%s?pgbouncer=true" $user $host $port $db -}}
{{- end }}

{{- define "vardiya.redis.url" -}}
{{- $host := printf "%s-redis-cluster" .Release.Name -}}
{{- $port := "6379" -}}
{{- printf "redis://:%s@%s:%s" (printf "$(REDIS_PASSWORD)") $host $port -}}
{{- end }}

{{- define "vardiya.serviceAccountName" -}}
{{- printf "%s-%s" (include "vardiya.fullname" .root) .component -}}
{{- end }}

{{/*
Pod-level security context shared by every workload (defect D10).

runAsNonRoot is unconditional, so a floating image tag can never re-introduce a
root user. runAsUser/runAsGroup/fsGroup are passed per component and only when
the shipped image needs them pinned (e.g. postgres ships no USER and relies on
gosu, so it must be told uid 70). seccompProfile RuntimeDefault is the strongest
runtime profile available without a cluster-specific policy.
Usage: {{ include "vardiya.podSecurityContext" (dict "runAsUser" 100 "runAsGroup" 100 "fsGroup" 100) | nindent 6 }}
*/}}
{{- define "vardiya.podSecurityContext" -}}
runAsNonRoot: true
{{- with .runAsUser }}
runAsUser: {{ . }}
{{- end }}
{{- with .runAsGroup }}
runAsGroup: {{ . }}
{{- end }}
{{- with .fsGroup }}
fsGroup: {{ . }}
{{- end }}
seccompProfile:
  type: RuntimeDefault
{{- end }}

{{/*
Container-level security context (defect D10): no privilege escalation, drop
every Linux capability, and pin a read-only root filesystem where the component
confines its writes to mounted volumes plus an explicit emptyDir /tmp.

readOnlyRootFilesystem is opt-in per component. The database plane (postgres,
pgbouncer, redis, sentinel) and the app plane (backend logs to /var/log/vardiya,
frontend nginx writes its cache/run dirs) keep a writable root fs until a live
rehearsal proves otherwise; they still get the escalation/capability hardening.
addCapabilities re-adds only what a component provably needs (frontend binds :80
as a non-root user, so it keeps NET_BIND_SERVICE).
Usage: {{ include "vardiya.containerSecurityContext" (dict "readOnlyRootFilesystem" true) | nindent 12 }}
*/}}
{{- define "vardiya.containerSecurityContext" -}}
allowPrivilegeEscalation: false
capabilities:
  drop:
    - ALL
{{- with .addCapabilities }}
  add:
    {{- range . }}
    - {{ . }}
    {{- end }}
{{- end }}
readOnlyRootFilesystem: {{ .readOnlyRootFilesystem | default false }}
{{- end }}
