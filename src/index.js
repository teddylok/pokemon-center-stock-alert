const express = require('express')
const expressApp = express()
const axios = require("axios")
const schedule = require('node-schedule')
const _ = require('lodash')
const path = require("path")
const port = process.env.PORT || 3000
expressApp.use(express.static('static'))
expressApp.use(express.json())
require('dotenv').config()

const { Telegraf } = require('telegraf');

const bot = new Telegraf(process.env.TG_BOT_TOKEN)
const cronJobTime = process.env.CRONJOB_TIME || '0 * * * * *'

const urls = {}

const crawlUrl = (url) => {
  return axios.get(url)
}

const addUrl = (chatId, url) => {
  if (!urls[chatId]) {
    urls[chatId] = []
  }
  
  urls[chatId] = _.uniq(_.concat(urls[chatId], url))
}

const removeUrl = (chatId, url) => {
  if (!urls[chatId]) {
    return false
  }

  urls[chatId] = _.without(urls[chatId], url)
}

const isSoldOut = (content) => {
  return content.indexOf('alt="SOLD OUT"') > 0 || content.indexOf('class="add_cart_btn"') === -1
}

const isCommand = (text) => {
  return text[0] === '/'
}

const getCommand = (text) => {
  return _.split(text, ' ')[0].substring(1)
}

const getValues = (text) => {
  const array = _.split(text, ' ')
  array.shift()

  return array
}

const getTitle = (content) => {
  const regEx = /<title>(.*)<\/title>/
  const matches = content.match(regEx, 'g')

  return matches[1] || ''
}

const getList = (chatId) => {
  let counter = 1
  let message = '網址:\n'

  _.forEach(urls[chatId], (url) => {
    message += `${counter}. ${url}\n\n`
    counter++
  })

  bot.telegram.sendMessage(chatId, message, {
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  })
}

const crawl = (chatId, showDone = false) => {
  urls[chatId].map(async (url) => {
    const response = await crawlUrl(url)
    const content = response.data
    const isProductSoldOut = isSoldOut(content)

    if (!isProductSoldOut) {
      bot.telegram.sendMessage(chatId, `${getTitle(content)}\n\n 有貨 <a href="${url}">[LINK]</a>\n`, {
        parse_mode: 'HTML'
      })
    }
  })

  if (showDone) {
    bot.telegram.sendMessage(chatId, 'DONE.')
  }
}

bot.command('start', context => {
  bot.telegram.sendMessage(
    context.chat.id,
    'Welcome to Pokemon Center Alert!',
    {}
  )
})

bot.command('list', context => getList(context.chat.id))

bot.command('add', context => {
  const values = getValues(context.message.text)
  addUrl(context.chat.id, values)
})

bot.command('remove', context => {
  const values = getValues(context.message.text)
  removeUrl(context.chat.id, values[0])
})

bot.command('get', context => crawl(context.chat.id, true))

expressApp.get('/', (req, res) => {
  res.sendFile(path.join(__dirname + '/index.html'));
})

bot.launch()

const job = schedule.scheduleJob(cronJobTime, () => {
  const date = new Date()
  console.log(`[DEBUG] Crawl at ${date.toISOString()}!`)

  _.forEach(urls, (url, chatId) => {
    crawl(chatId)
  })
})