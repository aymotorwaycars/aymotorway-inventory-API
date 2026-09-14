from node:18
workdr /app
copy . /app
expose 3000
cmd ['node server.js']
