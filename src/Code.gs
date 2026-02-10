/**
 * בודק עבודות אקדמיות - תוסף לגוגל דוקס
 * בודק מבנה, APA7, ותוכן של הצעות מחקר לתואר ראשון
 */

// ===================== תפריט ואתחול =====================

function onOpen() {
  DocumentApp.getUi()
    .createMenu('בודק עבודות')
    .addItem('הפעל בדיקה מלאה', 'showSidebar')
    .addItem('הגדרות API', 'showSettings')
    .addToUi();
}

function onHomepage() {
  return showSidebar();
}

function showSidebar() {
  var html = HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle('בודק עבודות אקדמיות')
    .setWidth(420);
  DocumentApp.getUi().showSidebar(html);
}

function showSettings() {
  var ui = DocumentApp.getUi();
  var currentKey = getApiKey();
  var maskedKey = currentKey ? '****' + currentKey.slice(-4) : 'לא הוגדר';

  var result = ui.prompt(
    'הגדרות - מפתח Gemini API',
    'מפתח נוכחי: ' + maskedKey + '\n\n' +
    'הכנס מפתח API של Gemini (ניתן להשיג בחינם מ-Google AI Studio):\n' +
    'https://aistudio.google.com/app/apikey',
    ui.ButtonSet.OK_CANCEL
  );

  if (result.getSelectedButton() === ui.Button.OK) {
    var key = result.getResponseText().trim();
    if (key) {
      PropertiesService.getUserProperties().setProperty('GEMINI_API_KEY', key);
      ui.alert('המפתח נשמר בהצלחה!');
    }
  }
}

function getApiKey() {
  return PropertiesService.getUserProperties().getProperty('GEMINI_API_KEY') || '';
}

// ===================== פונקציה ראשית =====================

function runFullCheck() {
  var doc = DocumentApp.getActiveDocument();
  var body = doc.getBody();
  var fullText = body.getText();

  if (!fullText || fullText.trim().length < 50) {
    return {
      error: true,
      message: 'המסמך ריק או קצר מדי לבדיקה. ודא שהעבודה מועתקת למסמך.'
    };
  }

  var results = {};

  // 1. בדיקת דף שער
  results.coverPage = checkCoverPage(body, fullText);

  // 2. בדיקת מבנה פרקים
  results.chapters = checkChapterStructure(body, fullText);

  // 3. בדיקת ביבליוגרפיה APA7
  results.apa = checkAPABibliography(body, fullText);

  // 4+5+6. סקירת תוכן עם AI (כולל ביקורת בונה ומתודולוגיה)
  var apiKey = getApiKey();
  if (apiKey) {
    results.contentReview = reviewAllContent(body, fullText, apiKey);
  } else {
    results.contentReview = {
      available: false,
      message: 'לסקירת תוכן מעמיקה, הגדר מפתח Gemini API דרך התפריט: בודק עבודות > הגדרות API'
    };
  }

  // 7. סיכום סופי
  results.summary = generateFinalSummary(results);

  return results;
}

// ===================== פונקציות עזר =====================

/**
 * מחלץ את כל הכותרות מהמסמך
 */
function extractHeadings(body) {
  var headings = [];
  var numChildren = body.getNumChildren();

  for (var i = 0; i < numChildren; i++) {
    var child = body.getChild(i);
    if (child.getType() === DocumentApp.ElementType.PARAGRAPH) {
      var para = child.asParagraph();
      var heading = para.getHeading();
      if (heading !== DocumentApp.ParagraphHeading.NORMAL) {
        headings.push({
          text: para.getText().trim(),
          heading: heading,
          index: i
        });
      }
    }
  }
  return headings;
}

/**
 * מחלץ פרקים מהמסמך לפי כותרות
 */
function extractChapters(body) {
  var chapters = [];
  var numChildren = body.getNumChildren();
  var currentChapter = null;

  for (var i = 0; i < numChildren; i++) {
    var child = body.getChild(i);
    if (child.getType() === DocumentApp.ElementType.PARAGRAPH) {
      var para = child.asParagraph();
      var heading = para.getHeading();
      var text = para.getText().trim();

      if (heading !== DocumentApp.ParagraphHeading.NORMAL && text.length > 0) {
        if (currentChapter) {
          chapters.push(currentChapter);
        }
        currentChapter = {
          title: text,
          heading: heading,
          content: '',
          startIndex: i
        };
      } else if (currentChapter && text.length > 0) {
        currentChapter.content += text + '\n';
      }
    }
  }

  if (currentChapter) {
    chapters.push(currentChapter);
  }

  return chapters;
}

/**
 * מייצר סיכום סופי
 */
function generateFinalSummary(results) {
  var issues = [];
  var hasBlockingIssues = false;

  if (!results.coverPage.valid) {
    issues.push('דף השער חסר פרטים');
  }
  if (!results.chapters.valid) {
    issues.push('מבנה הפרקים אינו תקין');
    hasBlockingIssues = true;
  }
  if (results.apa.errors && results.apa.errors.length > 5) {
    issues.push('נמצאו שגיאות רבות בביבליוגרפיה');
  }

  var summary = {};

  if (hasBlockingIssues) {
    summary.approved = false;
    summary.text = 'יש לתקן את הבעיות שצוינו לעיל ולהגיש מחדש לבדיקה.';
  } else if (issues.length > 3) {
    summary.approved = false;
    summary.text = 'נמצאו מספר נושאים לתיקון. יש לבצע את התיקונים המבוקשים ולהגיש מחדש.';
  } else {
    summary.approved = true;
    summary.text = 'הצעת המחקר מאושרת. ניתן להתקדם להגשת מדריך ראיון. בהצלחה!';
  }

  summary.issues = issues;
  return summary;
}
