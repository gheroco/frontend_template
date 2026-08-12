{{- define "github-webhooks.labels" -}}
app.kubernetes.io/name: github-webhooks
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Values.portalRegistration.serviceVersion | quote }}
app.kubernetes.io/part-of: atlas-platform
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}
{{- define "github-webhooks.selectorLabels" -}}
app.kubernetes.io/name: github-webhooks
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}
{{- define "github-webhooks.serviceAccountName" -}}{{ default "github-webhooks" .Values.serviceAccount.name }}{{- end -}}
{{- define "github-webhooks.image" -}}{{- if .Values.image.digest -}}{{ .Values.image.repository }}@{{ .Values.image.digest }}{{- else -}}{{ .Values.image.repository }}:{{ .Values.image.tag }}{{- end -}}{{- end -}}
{{- define "github-webhooks.secretEnv" -}}
- name: DATABASE_URL
  valueFrom: { secretKeyRef: { name: {{ .Values.secret.existingName }}, key: {{ .Values.secret.databaseUrlKey }} } }
- name: AMQP_URL
  valueFrom: { secretKeyRef: { name: {{ .Values.secret.existingName }}, key: {{ .Values.secret.amqpUrlKey }} } }
- name: GITHUB_WEBHOOK_SECRET
  valueFrom: { secretKeyRef: { name: {{ .Values.secret.existingName }}, key: {{ .Values.secret.webhookSecretKey }} } }
- name: GITHUB_WEBHOOK_PREVIOUS_SECRET
  valueFrom: { secretKeyRef: { name: {{ .Values.secret.existingName }}, key: {{ .Values.secret.previousWebhookSecretKey }}, optional: true } }
{{- end -}}
