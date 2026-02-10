/**
 * ContentReviewer.gs
 * סקירת תוכן אקדמית באמצעות Gemini AI
 * כולל ביקורת בונה לכל פרק והתמקדות בפרק השיטה
 */

// ===================== סקירת תוכן כוללת =====================

function reviewAllContent(body, fullText, apiKey) {
  var result = {
    available: true,
    chapters: [],
    methodology: null,
    generalComments: []
  };

  var chapters = extractChapters(body);

  if (chapters.length === 0) {
    result.available = false;
    result.message = 'לא ניתן לזהות פרקים במסמך. ודא שהכותרות מסומנות כ-Heading';
    return result;
  }

  // סקירת כל פרק
  for (var i = 0; i < chapters.length; i++) {
    var chapter = chapters[i];
    var isMethodology = isMethodologyChapter(chapter.title);
    var isBibliography = isBibliographyChapter(chapter.title);

    // דילוג על ביבליוגרפיה - נבדקת בנפרד
    if (isBibliography) continue;

    if (isMethodology) {
      // פרק השיטה - בדיקה מעמיקה (דרישה 6)
      result.methodology = reviewMethodologyChapter(chapter, apiKey);
    }

    // ביקורת בונה לכל פרק (דרישה 4)
    var chapterReview = reviewSingleChapter(chapter, isMethodology, apiKey);
    if (chapterReview) {
      result.chapters.push(chapterReview);
    }
  }

  return result;
}

// ===================== זיהוי סוג פרק =====================

function isMethodologyChapter(title) {
  var patterns = [/מתודולוגי/, /השיטה/, /שיטת\s*המחקר/, /מערך\s*המחקר/, /method/i];
  for (var i = 0; i < patterns.length; i++) {
    if (patterns[i].test(title)) return true;
  }
  return false;
}

function isBibliographyChapter(title) {
  var patterns = [/ביבליוגרפי/, /רשימת\s*מקורות/, /references/i, /bibliography/i];
  for (var i = 0; i < patterns.length; i++) {
    if (patterns[i].test(title)) return true;
  }
  return false;
}

// ===================== סקירת פרק בודד =====================

function reviewSingleChapter(chapter, isMethodology, apiKey) {
  if (!chapter.content || chapter.content.trim().length < 30) {
    return {
      title: chapter.title,
      comments: [{ type: 'warning', text: 'הפרק קצר מאוד או ריק. יש להרחיב.' }]
    };
  }

  // קיצור תוכן אם ארוך מדי (מגבלת API)
  var content = chapter.content;
  if (content.length > 6000) {
    content = content.substring(0, 3000) + '\n\n[...]\n\n' + content.substring(content.length - 3000);
  }

  var prompt = buildChapterReviewPrompt(chapter.title, content, isMethodology);
  var response = callGeminiAPI(prompt, apiKey);

  if (!response) {
    return {
      title: chapter.title,
      comments: [{ type: 'error', text: 'לא ניתן לסקור פרק זה - שגיאת API' }]
    };
  }

  return parseChapterReviewResponse(chapter.title, response);
}

// ===================== סקירת פרק שיטה מעמיקה =====================

function reviewMethodologyChapter(chapter, apiKey) {
  if (!chapter.content || chapter.content.trim().length < 50) {
    return {
      title: chapter.title,
      assessment: 'הפרק קצר מדי לביצוע סקירה מעמיקה',
      comments: []
    };
  }

  var content = chapter.content;
  if (content.length > 8000) {
    content = content.substring(0, 4000) + '\n\n[...]\n\n' + content.substring(content.length - 4000);
  }

  var prompt = buildMethodologyPrompt(content);
  var response = callGeminiAPI(prompt, apiKey);

  if (!response) {
    return {
      title: chapter.title,
      assessment: 'לא ניתן לסקור - שגיאת API',
      comments: []
    };
  }

  return parseMethodologyResponse(chapter.title, response);
}

// ===================== בניית פרומפטים =====================

function buildChapterReviewPrompt(title, content, isMethodology) {
  return 'אתה מנחה אקדמי מנוסה הבודק הצעת מחקר של סטודנט/ית לתואר ראשון.\n' +
    'קרא את הפרק הבא ותן בדיוק 3 הערות ביקורת בונות.\n' +
    'חשוב: שלב מחמאות כנות עם הצעות לשיפור. לפחות הערה אחת חיובית ולפחות הערה אחת ביקורתית.\n' +
    'התייחס לאיכות הכתיבה האקדמית, לבהירות הטיעונים, ולרמה המתאימה למחקר של תואר ראשון.\n' +
    (isMethodology ? 'שים לב: זהו פרק השיטה - התייחס גם לבהירות התיאור המתודולוגי.\n' : '') +
    '\n' +
    'שם הפרק: ' + title + '\n' +
    'תוכן הפרק:\n' + content + '\n\n' +
    'תן את תשובתך בפורמט הבא בדיוק (JSON):\n' +
    '{\n' +
    '  "comments": [\n' +
    '    {"type": "praise", "text": "הערה חיובית כאן"},\n' +
    '    {"type": "criticism", "text": "ביקורת בונה כאן"},\n' +
    '    {"type": "suggestion", "text": "הצעה לשיפור כאן"}\n' +
    '  ],\n' +
    '  "writingQuality": "good/fair/needs_improvement",\n' +
    '  "academicLevel": "appropriate/needs_work/insufficient"\n' +
    '}\n' +
    'חשוב: ענה רק ב-JSON תקין, בעברית, ללא טקסט נוסף.';
}

function buildMethodologyPrompt(content) {
  return 'אתה מנחה אקדמי מנוסה הבודק את פרק השיטה/מתודולוגיה בהצעת מחקר של סטודנט/ית לתואר ראשון.\n' +
    'בצע סקירה מעמיקה ומפורטת של הפרק. התמקד בנקודות הבאות:\n\n' +
    '1. ניסוח - האם הניסוח ברור, מדויק ואקדמי?\n' +
    '2. בהירות - האם ברור מה הסטודנט/ית מתכוון/ת לעשות?\n' +
    '3. שיטת מחקר - האם השיטה מתאימה לשאלות/השערות המחקר?\n' +
    '4. אוכלוסיית מחקר - האם מוגדרת היטב? גודל מדגם, קריטריונים להכללה/הדרה?\n' +
    '5. כלי מחקר - האם מתוארים כראוי? תוקף ומהימנות?\n' +
    '6. הליך המחקר - האם שלבי המחקר ברורים?\n' +
    '7. שיקולים אתיים - האם נכללים?\n' +
    '8. הרחבה/השמטה - האם יש סעיפים שדורשים הרחבה? האם יש מידע מיותר?\n' +
    '9. נכונות - האם יש טענות לא נכונות או לא מדויקות?\n\n' +
    'תוכן פרק השיטה:\n' + content + '\n\n' +
    'תן את תשובתך בפורמט הבא בדיוק (JSON):\n' +
    '{\n' +
    '  "overallAssessment": "הערכה כללית בפסקה קצרה",\n' +
    '  "comments": [\n' +
    '    {"category": "קטגוריה", "type": "praise/criticism/suggestion", "text": "הערה מפורטת", "priority": "high/medium/low"},\n' +
    '    ...\n' +
    '  ],\n' +
    '  "clarity": "clear/mostly_clear/unclear",\n' +
    '  "completeness": "complete/mostly_complete/needs_expansion/missing_elements",\n' +
    '  "needsExpansion": ["סעיף 1", "סעיף 2"],\n' +
    '  "canBeRemoved": ["סעיף שמיותר אם יש"]\n' +
    '}\n' +
    'חשוב: ענה רק ב-JSON תקין, בעברית, ללא טקסט נוסף. תן לפחות 5 הערות מפורטות.';
}

// ===================== קריאה ל-Gemini API =====================

function callGeminiAPI(prompt, apiKey) {
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey;

  var payload = {
    contents: [{
      parts: [{
        text: prompt
      }]
    }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048,
      topP: 0.9
    }
  };

  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    var response = UrlFetchApp.fetch(url, options);
    var statusCode = response.getResponseCode();

    if (statusCode !== 200) {
      Logger.log('Gemini API error: ' + statusCode + ' - ' + response.getContentText());
      return null;
    }

    var json = JSON.parse(response.getContentText());

    if (json.candidates && json.candidates[0] && json.candidates[0].content) {
      return json.candidates[0].content.parts[0].text;
    }

    return null;
  } catch (e) {
    Logger.log('Gemini API exception: ' + e.message);
    return null;
  }
}

// ===================== פירוש תשובות =====================

function parseChapterReviewResponse(title, responseText) {
  var result = {
    title: title,
    comments: [],
    writingQuality: '',
    academicLevel: ''
  };

  try {
    // ניקוי markdown wrappers אם יש
    var cleaned = responseText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    var data = JSON.parse(cleaned);

    if (data.comments && Array.isArray(data.comments)) {
      result.comments = data.comments;
    }
    result.writingQuality = data.writingQuality || '';
    result.academicLevel = data.academicLevel || '';
  } catch (e) {
    // אם הפירוש נכשל, ננסה לחלץ את הטקסט כמו שהוא
    result.comments = [{
      type: 'info',
      text: responseText.substring(0, 1000)
    }];
  }

  return result;
}

function parseMethodologyResponse(title, responseText) {
  var result = {
    title: title,
    overallAssessment: '',
    comments: [],
    clarity: '',
    completeness: '',
    needsExpansion: [],
    canBeRemoved: []
  };

  try {
    var cleaned = responseText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    var data = JSON.parse(cleaned);

    result.overallAssessment = data.overallAssessment || '';
    result.comments = data.comments || [];
    result.clarity = data.clarity || '';
    result.completeness = data.completeness || '';
    result.needsExpansion = data.needsExpansion || [];
    result.canBeRemoved = data.canBeRemoved || [];
  } catch (e) {
    result.overallAssessment = responseText.substring(0, 1000);
  }

  return result;
}
