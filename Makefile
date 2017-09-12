
.PHONY: openshift

openshift_host = quiz-openshift
openshift_path = app-root/data/quiz-chatbot-discord

openshift: qa-client.js start.js response-database.json package-lock.json
	scp $? $(openshift_host):$(openshift_path)
	ssh $(openshift_host)
