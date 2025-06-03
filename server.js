import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';

dayjs.extend(utc);
dayjs.extend(timezone);

import dotenv from 'dotenv';
dotenv.config();
console.log('🔐 CALCOM_API_KEY:', process.env.CALCOM_API_KEY ? '✔️ present' : '❌ missing');

import express from 'express';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Serve static files in `public/` (e.g. your openapi.json and logo.png)
app.use('/.well-known', express.static(path.join(__dirname, 'public/.well-known')));
app.use('/', express.static(path.join(__dirname, 'public')));


app.use(express.json());

const CALCOM_API_KEY = process.env.CALCOM_API_KEY;
const EVENT_TYPE_ID = '2576576';
const EVENT_TYPE_SLUG = 'bland-painworth-law-initial-consultation';
const DEFAULT_TIMEZONE = 'America/Edmonton';

const calcom = axios.create({
  baseURL: 'https://api.cal.com/v2',
  headers: {
    Authorization: `Bearer ${CALCOM_API_KEY}`
  }
});

app.post('/invoke', async (req, res) => {
  try {
    console.log('\n📥 Received /invoke request');
    const input = req.body.toolInput || {};
    const { name, email, preferredDate, preferredTime, topic } = input;

    console.log('🔎 toolInput:', {
      name,
      email,
      preferredDate,
      preferredTime,
      topic
    });

    if (!email || !preferredDate || !preferredTime) {
      console.log('❌ Missing required fields. Responding with error.');
      return res.status(400).json({
        output: `Hi ${name || 'client'}. Please provide an email, preferred date (YYYY-MM-DD), and time of day (morning or afternoon).`
      });
    }

    console.log(`🕓 Checking availability on ${preferredDate} in the ${preferredTime}`);

    const startTime = `${preferredDate}T00:00:00.000Z`;
    const endTime = `${preferredDate}T23:59:59.999Z`;

    const response = await calcom.get('/slots/available', {
      params: {
        startTime,
        endTime,
        eventTypeId: EVENT_TYPE_ID,
        eventTypeSlug: EVENT_TYPE_SLUG
      }
    });

    const slots = response.data?.data?.slots?.[preferredDate] || [];

    const matchingSlots = slots.filter(slot => {
      const hour = dayjs(slot.time).tz(DEFAULT_TIMEZONE).hour();
      return preferredTime === 'morning'
        ? hour >= 5 && hour < 12
        : hour >= 12 && hour < 17;
    });

    if (matchingSlots.length === 0) {
      console.log('🚫 No matching slots found.');
      return res.json({
        output: `Hi ${name}. Sorry, there are no available ${preferredTime} slots on ${preferredDate}. Please try another date or time.`
      });
    }

    const chosenSlot = matchingSlots[0];
    const formattedTime = dayjs(chosenSlot.time).tz(DEFAULT_TIMEZONE).format('h:mm A');
    console.log(`✅ Found slot: ${chosenSlot.time} (${formattedTime} Edmonton time)`);

    return res.json({
      output: `Hi ${name}. I found an available time on ${preferredDate} at ${formattedTime} (Edmonton time). Please confirm if this works or choose another time.`
    });

  } catch (err) {
    console.error('❌ Booking error:', {
      status: err?.response?.status,
      headers: err?.response?.headers,
      data: err?.response?.data,
      message: err.message
    });
    return res.status(500).json({
      output: `Sorry, ${req.body.toolInput?.name || 'client'}, something went wrong while checking availability.`
    });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`📅 Appointment MCP tool using Cal.com v2 is running on port ${port}`);
});
