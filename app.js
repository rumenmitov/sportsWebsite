// Packages
const fs = require("fs"),
  http = require('http'),
  https = require("https"),
  express = require("express"),
  bodyParser = require("body-parser"),
  cors = require("cors"),
  nodemailer = require("nodemailer"),
  mongo = require("mongodb"),
  colors = require("colors"),
  MongoClient = mongo.MongoClient;

  require('dotenv').config();

// SSL certificate is kept only at the server
const sslOptions = {
  key: fs.readFileSync("sslCertificate/sport.pupilscom-esl1.eu.key"),
  cert: fs.readFileSync("sslCertificate/sport.pupilscom-esl1.eu.pem"),
};

// URL for MongoDB Atlas
const AtlasUrl = process.env.ATLAS_URL;

// Credentials for PC email and the email setup
const credentials = {
  user: process.env.EMAIL,
  pass: process.env.EMAIL_PASS
};

let nodeTransporter = nodemailer.createTransport({
  service: "gmail",
  auth: credentials,
});

// Router for signup
let router = express.Router();
router.use(bodyParser.urlencoded({ extended: true }));

router.route("/verify").post((req, res, next) => {
  let recipient = req.body.email.toLowerCase();

  if (recipient.split("@")[1] !== "student.eursc.eu") {
    res.sendFile(__dirname + "/server/responsePages/invalidEmail.html");
  } else {
    let client = new MongoClient(AtlasUrl, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    client.connect((err) => {
      if (err) console.log(err);

      let db = client.db("basketballTournament").collection("participants");

      // Check if participant is already signed up
      db.find({ email: req.body.email }).toArray((err, results) => {
        if (err) console.log(err);

        let recipient = req.body.email;
        if (results[0]) {
          // If this is true that means email is already registered, so send email to tell user that the email is already in use
          nodeTransporter.sendMail(
            {
              from: credentials.user,
              to: recipient,
              subject: "Email Already in Use",
	      html: `
        <h1>Your email has already been used!</h1><br>
        <a href="https://sport.pupilscom-esl1.eu/">
            Back to site
        </a>
        <br><br><br>
        <p>Having trouble verifying your email?<br>Click on the link below to contact us.</p>
        <a href="https://sport.pupilscom-esl1.eu/contact.html?reportType=signup">
            Click here
        </a>
	      `,
            },
            (err) => {
              if (err) console.log(err);
              res.sendFile(
                __dirname + "/server/responsePages/emailAlreadyInUse.html"
              );
              client.close();
            }
          );
        } else {
          // If not, send verification email
          if (recipient) {
            // Before sending the email we have to decrypt the user's email which they will use later to sign-up
            let encodedEmail = Buffer.from(recipient);
            encodedEmail = encodedEmail.toString("base64");
            nodeTransporter.sendMail(
              {
                from: credentials.user,
                to: recipient,
                subject: "Email Verification",
                html: `
                    <p>Click below to sign-up!</p><br>
                  <a href='https://${process.env.DOMAIN}/signup.html?userCode=${encodedEmail}'>Sign-up
                  </a>
               `,
              },
              (err) => {
                if (err) console.log(err);
                res.sendFile(
                  __dirname + "/server/responsePages/verificationEmailSent.html"
                );
                client.close();
              }
            );
          }
        }
      });
    });
  }
});

// This part of the router is responsible for the GET and POST (for seeing all data and adding new participants)
router
  .route("/participants")
  .get((req, res, next) => {
    // This is for searching the databse
    let client = new MongoClient(AtlasUrl, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    client.connect((err) => {
      if (err) console.log(err);

      let db = client.db("basketballTournament").collection("participants");

      db.find().toArray((err, results) => {
        if (err) console.log(err);
        res.send(results);
        client.close();
      });
    });
  })
  .post((req, res, next) => {
    // This is for adding to the database
    if (req.body) {
      let client = new MongoClient(AtlasUrl, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
      client.connect((err) => {
        if (err) console.log(err);

        let db = client.db("basketballTournament").collection("participants");
        let dbTeams = client.db("basketballTournament").collection("teams");

        // Check if participant is already signed up
        db.find({ email: req.body.email.toLowerCase() }).toArray((err, results) => {
          if (err) console.log(err);

          let recipient = req.body.email.toLowerCase();
          if (results[0]) {
            // If this is true that means email is already registered, so send email to tell user that the email is already in use
            let emailAlreadyInUse = fs.readFileSync(__dirname + '/server/email/emailAlreadyInUseEmail.html');
            nodeTransporter.sendMail(
              {
                from: credentials.user,
                to: recipient,
                subject: "Email Already in Use",
                html: emailAlreadyInUse,
              },
              (err) => {
                if (err) console.log(err);
                res.sendFile(
                  __dirname + "/server/responsePages/emailAlreadyInUse.html"
                );
                client.close();
              }
            );
          } else {
            let newParticipant = {
              firstName: req.body.firstName.toUpperCase(),
              lastName: req.body.lastName.toUpperCase(),
              dob: req.body.dob,
              class: req.body.class.toUpperCase(),
              email: req.body.email.toLowerCase(),
            };
            if (req.body.team === "newTeam")
              newParticipant.team = req.body.newTeam.toUpperCase();
            else newParticipant.team = req.body.team.toUpperCase();

            db.insertOne(newParticipant, (err, docs) => {
              if (err) console.log(err);
              console.log("New person added.");
            });

            dbTeams
              .find({ team: newParticipant.team })
              .toArray((err, results) => {
                if (err) console.log(err);

                if (results[0]) {
                  // Add participant to team in Teams collection (if team already exists)
                  dbTeams.updateOne(
                    { team: newParticipant.team },
                    { $push: { teamMembers: newParticipant } },
                    (err) => {
                      if (err) console.log(err);

                      let listOfTeammates = "";
                      for (let index in results[0].teamMembers) {
                        if (index == 0) {
                          listOfTeammates = `${results[0].teamMembers[index].firstName} ${results[0].teamMembers[index].lastName}`;
                        } else {
                          listOfTeammates += `, ${results[0].teamMembers[index].firstName} ${results[0].teamMembers[index].lastName}`;
                        }
                      }

                      nodeTransporter.sendMail(
                        {
                          from: credentials.user,
                          to: recipient,
                          subject: "Thank you for signing-up!",
                          html: `<h1>Here is your info:</h1>
                          <p><b>First Name:</b> ${newParticipant.firstName}</p>
                          <p><b>Last Name:</b> ${newParticipant.lastName}</p>
                          <p><b>Date of Birth:</b> ${newParticipant.dob}</p>
                          <p><b>Class:</b> ${newParticipant.class}</p>
                          <p><b>Team:</b> ${newParticipant.team}</p>
                          <hr>
                          <h2>Your teammates are:</h2>
                          <p>${listOfTeammates}</p>
                          <a href='https://${process.env.DOMAIN}/'>Back to site</a>`,
                        },
                        (err) => {
                          if (err) console.log(err);
                          console.log("Participant added to team.");
                        }
                      );

                      // sending an email to notify the other members of the team
                      let listOfTeamEmails = [];
                      for (let index in results[0].teamMembers) {
                        listOfTeamEmails.push(
                          results[0].teamMembers[index].email
                        );
                      }
                      nodeTransporter.sendMail(
                        {
                          from: credentials.user,
                          to: listOfTeamEmails,
                          subject: "New Member was Added to Your Team",
                          html: `<h1>Here is their info:</h1>
                          <p><b>First Name:</b> ${newParticipant.firstName}</p>
                          <p><b>Last Name:</b> ${newParticipant.lastName}</p>
                          <p><b>Date of Birth:</b> ${newParticipant.dob}</p>
                          <p><b>Class:</b> ${newParticipant.class}</p>
                          <p><b>Team:</b> ${newParticipant.team}</p>
                          <a href='https://${process.env.DOMAIN}'>Back to site</a>`,
                        },
                        (err) => {
                          if (err) console.log(err);
                          console.log("Team has been notified");
                          res.sendFile(
                            __dirname +
                              "/server/responsePages/userSignedUp.html"
                          );
                          client.close();
                        }
                      );
                    }
                  );
                } else {
                  // Create new team and add player
                  let newTeamObj = {
                    team: newParticipant.team,
                    teamMembers: [newParticipant],
                    scores: [],
                    wins: 0,
                    losses: 0,
                  };

                  dbTeams.insertOne(newTeamObj, (err, docs) => {
                    if (err) console.log(err);

                    nodeTransporter.sendMail(
                      {
                        from: credentials.user,
                        to: recipient,
                        subject: "Thank you for signing-up!",
                        html: `<h1>Here is your info:</h1>
                        <p><b>First Name:</b> ${newParticipant.firstName}</p>
                        <p><b>Last Name:</b> ${newParticipant.lastName}</p>
                        <p><b>Date of Birth:</b> ${newParticipant.dob}</p>
                        <p><b>Class:</b> ${newParticipant.class}</p>
                        <p><b>Team:</b> ${newParticipant.team}</p>
                        <hr>
                        <p>You do not have any teammates yet. You will be notified if other players join your team.</p>
                        <a href='https://${process.env.DOMAIN}'>Back to site</a>`,
                      },
                      (err) => {
                        if (err) console.log(err);
                        res.sendFile(
                          __dirname + "/server/responsePages/userSignedUp.html"
                        );
                        console.log("New team created.");
                        console.log("Participant added to team.");
                        client.close();
                      }
                    );
                  });
                }
              });
          }
        });
      });
    }
  });

// This part of the router is responsible for handling the teams
router
  .route("/teams")
  .get((req, res) => {
    let client = new MongoClient(AtlasUrl, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    client.connect((err) => {
      if (err) console.log(err);

      let dbTeams = client.db("basketballTournament").collection("teams");

      dbTeams.find().toArray((err, results) => {
        if (err) console.log(err);

        res.send(results);
        client.close();
      });
    });
  })
  .post((req, res) => {
    // First process the information
    let team1result =
      req.body.team1score +
      ` (${req.body.team1}) : ` +
      req.body.team2score +
      ` (${req.body.team2})`;
    let team2result =
      req.body.team2score +
      ` (${req.body.team2}) : ` +
      req.body.team1score +
      ` (${req.body.team1})`;
    let team1won, team2won;
    if (req.body.team1score === req.body.team2score) {
      res.sendFile(__dirname + '/server/responsePages/scoreError.html');
    } else {
      if (Number(req.body.team1score) > Number(req.body.team2score)) {
        team1won = true;
        team2won = false;
      } else {
        team1won = false;
        team2won = true;
      }

      // Next update the database
      let client = new MongoClient(AtlasUrl, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
      client.connect((err) => {
        if (err) console.log(err);
  
        let dbTeams = client.db("basketballTournament").collection("teams");
  
        if (team1won) {
          dbTeams.updateOne(
            { team: req.body.team1 },
            { $push: { scores: team1result }, $inc: { wins: 1 } },
            (err) => {
              if (err) console.log(err);
            }
          );
  
          dbTeams.updateOne(
            { team: req.body.team2 },
            { $push: { scores: team2result }, $inc: { losses: 1 } },
            (err) => {
              if (err) console.log(err);
  
              res.sendFile(__dirname + '/server/responsePages/scoreSuccess.html');
              client.close();
            }
          );
        } else {
          dbTeams.updateOne(
            { team: req.body.team1 },
            { $push: { scores: team1result }, $inc: { losses: 1 } },
            (err) => {
              if (err) console.log(err);
            }
          );
  
          dbTeams.updateOne(
            { team: req.body.team2 },
            { $push: { scores: team2result }, $inc: { wins: 1 } },
            (err) => {
              if (err) console.log(err);
  
              res.sendFile(__dirname + '/server/responsePages/scoreSuccess.html');
              client.close();
            }
          );
        }
      });
    }

  });

// This part of the router is responsible for DELETE (because I need to find parameters to pass data to server)
router.route("/delete/:userInfo").delete((req, res, next) => {
  // This is to delete entries in the table
  let requestID = JSON.parse(req.params["userInfo"])["id"];
  let requestTeam = JSON.parse(req.params["userInfo"])["team"];
  let requestEmail = JSON.parse(req.params["userInfo"])["email"];

  if (requestID) {
    // Deleting users by ID (to prevent deletion of the wrong participant by accident)
    let findKeyID = { _id: mongo.ObjectId(requestID) };
    let findKeyTeam = { team: requestTeam };
    let findKeyEmail = { email: requestEmail };

    // First delete participant from team
    let teamClient = new MongoClient(AtlasUrl, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    teamClient.connect((err) => {
      if (err) console.log(err);

      let db = teamClient.db("basketballTournament").collection("teams");
      // Find the right team
      db.find(findKeyTeam).toArray((err, results) => {
        if (err) console.log(err);

        // We get an array back which contains the team that we want
        for (let index in results[0].teamMembers) {
          console.log(index);
          // Find the right participant and remove them from the team
          if (results[0].teamMembers[index].email === requestEmail) {
            results[0].teamMembers.splice(index, 1);

            db.deleteOne(findKeyTeam, (err, docs) => {
              if (err) console.log(err);

              // Now add the team to the collection again
              db.insertOne(results[0], (err, docs) => {
                if (err) console.log(err);
                console.log("Object added again");
                teamClient.close();
              });
            });
            return;
          }
        }
      });
    });

    // Then delete participant
    let client = new MongoClient(AtlasUrl, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    client.connect((err) => {
      if (err) console.log(err);

      let db = client.db("basketballTournament").collection("participants");
      db.deleteOne(findKeyID, (err, docs) => {
        if (err) console.log(err);

        console.log("Participant deleted.");
        res.send(
          `<p>Participant with email: <b>${requestEmail}</b> deleted successfully!`
        );
        client.close();
      });
    });
  }
});

// This part of the router is for dealing with bug reports
router.route('/bugs').post((req, res)=>{
  nodeTransporter.sendMail({
    from: credentials.user,
    to: credentials.user,
    subject: "User Report",
    html: `<p>Student <b>${req.body.sender}</b> has submitted a <b>${req.body.type}</b> report.</p>
    <hr>
    <p>Their email is <b>${req.body.email}</b>.
    <hr>
    <p>The report:</p>
    <br>
    <pre><b>${req.body.comment}</b></pre>`
  }, (err)=>{
    if (err) console.log(err);

    res.sendFile(__dirname + '/server/responsePages/reportSent.html')
  });
});

// This part of the router is for the loading screen facts
router.route('/facts').get((req, res)=>{
  let factsFile = fs.readFileSync(__dirname + '/facts.txt', 'utf-8');
  factsArray = factsFile.split('\n');

  res.json(factsArray);
  res.end();
});

// Credentials for admin portal
const authCredentials = {
  user: process.env.AUTH_USER,
  pass: process.env.AUTH_PASS
};

function auth(req, res, next) {
  function send401() {
    res.writeHead(401, { "WWW-Authenticate": "Basic" });
    res.end();
  }

  let authHeader = req.headers.authorization;

  if (!authHeader) {
    send401();
    return;
  }

  let auth = new Buffer(authHeader.split(" ")[1], "base64")
    .toString()
    .split(":");
  let user = auth[0];
  let pass = auth[1];

  if (user == authCredentials.user && pass == authCredentials.pass) {
    next(); // all good
  } else send401();
}

// Finally, launching the server
let app = express()
  .use(cors())
  // Login to admin portal
  .use("/admin", auth)
  .use("/admin", express.static(__dirname + "/admin", { index: "admin.html" }))
  // Normal website
  .use(express.static(__dirname + "/public"))
  .use("/server", router);
https.createServer(sslOptions, app).listen(443);

// Redirecting HTTP trffic
http
  .createServer((req, res) => {
    res.writeHead(301, { "Location": `https://${process.env.DOMAIN}` });
    res.end();
  })
  .listen(80);

console.clear();
console.log('\n----------------------------------------\n');
console.log(`Website hosted on: https://${process.env.DOMAIN}`.yellow);
console.log('\n----------------------------------------\n\n');
