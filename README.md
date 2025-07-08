!!! for local environment uncomment code in `secrets.js`

TEMP: after each deploy:

- In backend pipeline search for (invoke_url = "invoke_url = "https://u3mk762x65.execute-api.***.amazonaws.com/prod/"), or directrly from API gateway.
- https://www.strava.com/settings/api -> edit -> update Authorization Callback Domain with the invoke_url value
- Update TEST_API_BASE_URL in client secrets with the invoke_url value
