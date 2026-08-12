{{- define "portal-shell.name" -}}portal-shell{{- end -}}
{{- define "portal-shell.fullname" -}}{{ include "portal-shell.name" . }}{{- end -}}
{{- define "portal-shell.labels" -}}
app.kubernetes.io/name: {{ include "portal-shell.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/part-of: atlas-platform
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}
{{- define "portal-shell.selectorLabels" -}}
app.kubernetes.io/name: {{ include "portal-shell.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}
{{- define "portal-shell.serviceAccountName" -}}{{ default (include "portal-shell.fullname" .) .Values.serviceAccount.name }}{{- end -}}
{{- define "portal-shell.image" -}}{{- if .Values.image.digest -}}{{ .Values.image.repository }}@{{ .Values.image.digest }}{{- else -}}{{ .Values.image.repository }}:{{ .Values.image.tag }}{{- end -}}{{- end -}}

