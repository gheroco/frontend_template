{{- define "extension-registry.name" -}}extension-registry{{- end -}}
{{- define "extension-registry.fullname" -}}{{ include "extension-registry.name" . }}{{- end -}}
{{- define "extension-registry.labels" -}}app.kubernetes.io/name: extension-registry
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/part-of: atlas-platform
app.kubernetes.io/managed-by: {{ .Release.Service }}{{- end -}}
{{- define "extension-registry.selectorLabels" -}}app.kubernetes.io/name: extension-registry
app.kubernetes.io/instance: {{ .Release.Name }}{{- end -}}
{{- define "extension-registry.serviceAccountName" -}}{{ default "extension-registry" .Values.serviceAccount.name }}{{- end -}}
{{- define "extension-registry.image" -}}{{- if .Values.image.digest -}}{{ .Values.image.repository }}@{{ .Values.image.digest }}{{- else -}}{{ .Values.image.repository }}:{{ .Values.image.tag }}{{- end -}}{{- end -}}

