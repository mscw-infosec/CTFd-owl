FROM python:3.12-alpine

WORKDIR /app
COPY requirements.txt .
RUN pip3 install -r requirements.txt
COPY . .
EXPOSE 9339

CMD ["flask", "--app", "main", "run", "--port", "9339", "--host", "0.0.0.0"]
