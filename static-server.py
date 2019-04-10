from flask import Flask, request, send_from_directory

app = Flask('DevServer', static_url_path='/')

@app.route('/<path:path>')
def send(path):
	return send_from_directory('.', path)

app.run()
