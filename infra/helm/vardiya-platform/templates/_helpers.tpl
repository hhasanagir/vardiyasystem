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
