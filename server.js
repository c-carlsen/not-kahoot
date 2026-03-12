const { app } = require("./app");

const port = Number(process.env.PORT || 8080);

app.listen(port, () => {
  console.log(`NOT KAHOOT running on http://localhost:${port}`);
});
