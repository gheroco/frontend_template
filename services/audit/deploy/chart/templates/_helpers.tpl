{{- define "audit.labels" -}}app.kubernetes.io/name: audit
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Values.portalRegistration.serviceVersion | quote }}
app.kubernetes.io/part-of: atlas-platform
app.kubernetes.io/managed-by: {{ .Release.Service }}{{- end -}}
{{- define "audit.selectorLabels" -}}app.kubernetes.io/name: audit
app.kubernetes.io/instance: {{ .Release.Name }}{{- end -}}
{{- define "audit.serviceAccountName" -}}{{ default "audit" .Values.serviceAccount.name }}{{- end -}}
{{- define "audit.image" -}}{{- if .Values.image.digest -}}{{ .Values.image.repository }}@{{ .Values.image.digest }}{{- else -}}{{ .Values.image.repository }}:{{ .Values.image.tag }}{{- end -}}{{- end -}}

