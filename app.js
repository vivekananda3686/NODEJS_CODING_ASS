const express = require('express')
const app = express()
app.use(express.json())
const path = require('path')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const dbpath = path.join(__dirname, 'twitterClone.db')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
let db = null

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbpath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server is running at http://localhost:3000/')
    })
  } catch (e) {
    console.log(`DB Error message is ${e.message}`)
    process.exit(1)
  }
}

initializeDBAndServer()

const tokenVerification = (request, response, next) => {
  const {tweetid} = request.params
  const {tweet} = request.body
  let jwttoken
  const authheader = request.headers['authorization']
  if (authheader !== undefined) {
    jwttoken = authheader.split(' ')[1]
  }
  if (jwttoken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwttoken, 'MY_SECRET_KEY',async  (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.jwtToken = jwttoken
        request.user_id = payload.user_id
        request.tweetId = tweetid
        request.tweet = tweet
        next()
      }
    })
  }
}

////API-1

app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const hashedpwd = await bcrypt.hash(password, 10)
  const checkuser = `
    select
    *
    from
    user
    where
    username='${username}';
    `
  const user = await db.get(checkuser)
  if (user === undefined) {
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const createuser = `
        insert 
        into
        user
        (name,username,password,gender)
        values
        ('${name}','${username}','${hashedpwd}','${gender}');
        `
      await db.run(createuser)
      response.status(200)
      response.send('User created successfully')
    }
  } else {
    response.status(400)
    response.send('User already exists')
  }
})

///API-2

app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const checkuser = `
  select
  *
  from
  user
  where
  username='${username}';
  `
  const user = await db.get(checkuser)
  if (user === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const ispwdmatched = await bcrypt.compare(password, user.password)
    if (ispwdmatched === true) {
      // const payload = {user_id: user.user_id}
      const payload = {username: username}
      const jwttoken = jwt.sign(payload, 'MY_SECRET_KEY')
      response.send({jwtToken: jwttoken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

///API-3

app.get('/user/tweets/feed/', tokenVerification, async (request, response) => {
  const {user_id} = request
  console.log(user_id)
  const getquery = `
    select
    username,
    tweet,
    date_time as dateTime
    from
    follower
    inner join
    tweet
    on
    follower.following_user_id=tweet.user_id
    where
    tweet.user_id='${user_id}'
    order by 
    date_time desc,
    limit 4
     offset 0;
    `
  const dbresponse = await db.all(getquery)
  response.send(dbresponse)
})

///API-4

app.get('/user/following/', tokenVerification, async (request, response) => {
  const {user_id, tweetId} = request
  const getquery = `
    select
    name
    from
    user
    left join
    follower
    on
    user.user_id=follower.follower_user_id
    where
    user.user_id='${user_id}'
    `
  const dbresponse = await db.all(getquery)
  response.send(dbresponse)
})

///API--5

app.get('/user/followers/', tokenVerification, async (request, response) => {
  const {user_id} = request
  const getquery = `
    select
    name
    from
    user
    inner join
    follower
    on
    user.user_id=follower.follower_user_id
    where
    user.user_id='${user_id}'
    `
  const dbresponse = await db.all(getquery)
  response.send(dbresponse)
})

///API--6

app.get('/tweets/:tweetId/', tokenVerification, async (request, response) => {
  const {user_id} = request
  const getquery = `
  select
   t.tweet,
   count(l.like_id) as likes,
   count(r.reply_id) as replies,
   t.date_time as dateTime
   from
   tweet t
   left join
   reply r on t.tweet_id=r.tweet_id
   left join 
   like l on t.tweet_id = l.tweet_id
   where
   t.user_id='${user_id}'
   group by
   t.tweet_id,
   t.tweet,
   t.date_time;
    `
  const dbresponse = await db.all(getquery)
  if (dbresponse === undefined) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    response.send(dbresponse)
  }
})

//API----7

app.get(
  '/tweets/:tweetId/likes/',
  tokenVerification,
  async (request, response) => {
    const {tweetId, user_id} = request
    const getquery = `
  SELECT
    u.username AS name
FROM
    tweet t
INNER JOIN
    like l ON t.tweet_id = l.tweet_id
INNER JOIN
    user u ON l.user_id = u.user_id
WHERE
    t.tweet_id = '${tweetId}'
    AND t.user_id IN (
        SELECT followed_user_id FROM follow WHERE follower_user_id = '${user_id}'
    );
  `
    const dbresponse = await db.all(getquery)
    if (dbresponse === undefined) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      response.send({likes: dbresponse})
    }
  },
)

///API---8

app.get(
  '/tweets/:tweetId/replies/',
  tokenVerification,
  async (request, response) => {
    const {user_id, tweetId} = request
    const getquery = `
  SELECT
    u.username AS name,
    r.reply as reply
FROM
    tweet t
INNER JOIN
    reply r ON t.tweet_id = r.tweet_id
INNER JOIN
    user u ON r.user_id = u.user_id
WHERE
    t.tweet_id = '${tweetId}'
    AND t.user_id IN (
        SELECT followed_user_id FROM follow WHERE follower_user_id = '${user_id}'
    );
  `
    const dbresponse = await db.all(getquery)
    if (dbresponse === undefined) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      response.send({replies: dbresponse})
    }
  },
)

///API-9

app.get('/user/tweets/', tokenVerification, async (request, response) => {
  const {user_id, tweetId} = request
  const getquery = `
  SELECT
    t.tweet AS tweet,
    COUNT(l.like_id) AS likes,
    COUNT(r.reply_id) AS replies,
    t.date_time AS dateTime
FROM
    tweet t
LEFT JOIN
    reply r ON t.tweet_id = r.tweet_id
LEFT JOIN
    like l ON t.tweet_id = l.tweet_id
WHERE
    t.user_id = '${user_id}'
GROUP BY
    t.tweet_id, t.tweet, t.date_time;
  `
  const dbresponse = await db.all(getquery)
  response.send(dbresponse)
})

///API--10

app.post('/user/tweets/', tokenVerification, async (request, response) => {
  const {user_id, tweet} = request
  const insertquery = `
  INSERT 
  INTO 
  tweet 
  (tweet,user_id,date_time)
  VALUES 
  ('${tweet}', NOW(), '${user_id}');
  `
  const dbresponse = await db.run(insertquery)
  response.send('Created a Tweet')
})

///API--11

app.delete(
  '/tweets/:tweetId/',
  tokenVerification,
  async (request, response) => {
    const {tweetId, user_id} = request
    const deletequery = `
  DELETE FROM tweet
WHERE tweet_id = '${tweetId}' AND user_id = '${user_id}';
SELECT 
    CASE 
        WHEN ROW_COUNT() > 0 THEN 'Tweet Removed'
        ELSE 'Invalid Request'
    END AS response_message;
  `
    const dbresponse = await db.get(deletequery)
    if (dbresponse === 'Invalid Request') {
      response.status(401)
      response.send('Invalid Request')
    } else {
      response.send('Tweet Removed')
    }
  },
)

module.exports = app
