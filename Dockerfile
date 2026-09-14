from node:18
workdir /app
copy . /app
expose 3000
cmd ['node server.js']
