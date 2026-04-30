const express = require('express');
const multer = require('multer');
const cors = require('cors');

const app = express();
app.use(cors());

const upload = multer({ dest: 'uploads/' });

app.post('/scan', upload.single('image'), async (req, res) => {
  try {
    // 👉 Simulated detection (replace later with real OMR)
    const detectedAnswers = ['A', 'C', 'B', 'D', 'A'];

    const answerKey = ['A', 'C', 'B', 'D', 'C'];

    const results = detectedAnswers.map((ans, i) => ({
      question: i + 1,
      student: ans,
      correct: answerKey[i],
      isCorrect: ans === answerKey[i],
    }));

    const score = results.filter(r => r.isCorrect).length;

    res.json({
      score,
      total: answerKey.length,
      results,
    });

  } catch (err) {
    res.status(500).json({ error: 'Scan failed' });
  }
});

app.listen(3000, () => console.log('Server running'));