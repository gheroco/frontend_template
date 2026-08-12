{{- define "inventory.labels" -}}app.kubernetes.io/name: inventory
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Values.portalRegistration.serviceVersion | quote }}
app.kubernetes.io/part-of: atlas-platform
app.kubernetes.io/managed-by: {{ .Release.Service }}{{- end -}}
{{- define "inventory.selectorLabels" -}}app.kubernetes.io/name: inventory
app.kubernetes.io/instance: {{ .Release.Name }}{{- end -}}
{{- define "inventory.serviceAccountName" -}}{{ default "inventory" .Values.serviceAccount.name }}{{- end -}}
{{- define "inventory.image" -}}{{- if .Values.image.digest -}}{{ .Values.image.repository }}@{{ .Values.image.digest }}{{- else -}}{{ .Values.image.repository }}:{{ .Values.image.tag }}{{- end -}}{{- end -}}

