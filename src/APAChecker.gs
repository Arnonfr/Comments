/**
 * APAChecker.gs
 * בדיקת ביבליוגרפיה לפי כללי APA7
 */

function checkAPABibliography(body, fullText) {
  var result = {
    found: false,
    referenceCount: 0,
    errors: [],
    warnings: [],
    findings: []
  };

  // מציאת קטע הביבליוגרפיה
  var bibSection = findBibliographySection(fullText);

  if (!bibSection) {
    result.errors.push('לא נמצא קטע ביבליוגרפיה במסמך. ודא שיש כותרת "ביבליוגרפיה" או "רשימת מקורות" או "References"');
    return result;
  }

  result.found = true;
  result.findings.push('נמצא קטע ביבליוגרפיה');

  // פירוק לרשומות בודדות
  var references = parseReferences(bibSection);
  result.referenceCount = references.length;
  result.findings.push('נמצאו ' + references.length + ' רשומות ביבליוגרפיות');

  if (references.length === 0) {
    result.errors.push('לא נמצאו רשומות ביבליוגרפיות. ודא שכל רשומה מופרדת בשורה חדשה');
    return result;
  }

  // בדיקה כל רשומה
  for (var i = 0; i < references.length; i++) {
    var ref = references[i].trim();
    if (ref.length < 10) continue;

    var refErrors = validateAPAReference(ref, i + 1);
    result.errors = result.errors.concat(refErrors.errors);
    result.warnings = result.warnings.concat(refErrors.warnings);
  }

  // בדיקת סדר אלפביתי
  checkAlphabeticalOrder(references, result);

  // בדיקות כלליות
  checkGeneralAPARules(references, result);

  return result;
}

/**
 * מוצא את קטע הביבליוגרפיה במסמך
 */
function findBibliographySection(fullText) {
  var bibPatterns = [
    /(?:ביבליוגרפיה|רשימת\s*מקורות|מקורות|references|bibliography)\s*\n([\s\S]+)$/i
  ];

  for (var i = 0; i < bibPatterns.length; i++) {
    var match = fullText.match(bibPatterns[i]);
    if (match) {
      return match[1].trim();
    }
  }

  // fallback: חיפוש מהסוף
  var lines = fullText.split('\n');
  for (var j = lines.length - 1; j >= 0; j--) {
    var line = lines[j].trim().toLowerCase();
    if (line === 'ביבליוגרפיה' || line === 'רשימת מקורות' ||
        line === 'references' || line === 'bibliography' || line === 'מקורות') {
      return lines.slice(j + 1).join('\n').trim();
    }
  }

  return null;
}

/**
 * מפרק את הביבליוגרפיה לרשומות בודדות
 */
function parseReferences(bibText) {
  var lines = bibText.split('\n');
  var references = [];
  var currentRef = '';

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (line.length === 0) {
      if (currentRef.length > 0) {
        references.push(currentRef.trim());
        currentRef = '';
      }
      continue;
    }

    // רשומה חדשה מתחילה בדרך כלל עם שם משפחה (אות גדולה באנגלית או אות עברית)
    // או עם תווים שאינם רווח בתחילת השורה (אחרי שורה ריקה)
    var isNewEntry = false;

    if (currentRef.length > 0) {
      // בדיקה אם זו שורה חדשה של רשומה חדשה
      // רשומה חדשה מתחילה בדרך כלל עם שם (uppercase letter or Hebrew)
      if (/^[A-Z\u0590-\u05FF]/.test(line) && /\(\d{4}/.test(line)) {
        isNewEntry = true;
      }
    }

    if (isNewEntry) {
      references.push(currentRef.trim());
      currentRef = line;
    } else {
      currentRef += (currentRef.length > 0 ? ' ' : '') + line;
    }
  }

  if (currentRef.trim().length > 0) {
    references.push(currentRef.trim());
  }

  return references;
}

/**
 * בודק רשומה בודדת מול כללי APA7
 */
function validateAPAReference(ref, index) {
  var errors = [];
  var warnings = [];
  var refPreview = ref.substring(0, 50) + (ref.length > 50 ? '...' : '');

  // בדיקה 1: שנה בסוגריים
  var yearPattern = /\((\d{4}[a-z]?)\)/;
  if (!yearPattern.test(ref)) {
    // בדיקה אם יש שנה אבל ללא סוגריים
    if (/\d{4}/.test(ref)) {
      errors.push('רשומה ' + index + ': השנה צריכה להופיע בסוגריים עגולים, לדוגמה: (2024) - "' + refPreview + '"');
    } else {
      errors.push('רשומה ' + index + ': לא נמצאה שנת פרסום - "' + refPreview + '"');
    }
  } else {
    var yearMatch = ref.match(yearPattern);
    var year = parseInt(yearMatch[1]);
    if (year < 1900 || year > 2030) {
      warnings.push('רשומה ' + index + ': שנה לא סבירה (' + year + ') - "' + refPreview + '"');
    }
  }

  // בדיקה 2: נקודה בסוף הרשומה
  var lastChar = ref.trim().slice(-1);
  if (lastChar !== '.' && !ref.match(/https?:\/\/\S+$/)) {
    // URL בסוף הרשומה פטור מנקודה (APA7)
    warnings.push('רשומה ' + index + ': חסרה נקודה בסוף הרשומה - "' + refPreview + '"');
  }

  // בדיקה 3: פורמט מחבר - שם משפחה, ראשי תיבות
  var isEnglish = /^[A-Z]/.test(ref);
  if (isEnglish) {
    // בדיקת פורמט: LastName, F. I.
    var authorPart = ref.split(/\(\d{4}/)[0];
    if (authorPart) {
      // בדיקה שיש פסיק אחרי שם המשפחה
      if (!/^[A-Z][a-z]+,\s*[A-Z]\./.test(authorPart.trim())) {
        warnings.push('רשומה ' + index + ': ודא פורמט מחבר תקין: שם משפחה, א. ת. - "' + refPreview + '"');
      }

      // בדיקת & לפני מחבר אחרון (אם יש יותר ממחבר אחד)
      if (authorPart.indexOf(',') !== authorPart.lastIndexOf(',') &&
          authorPart.indexOf('&') === -1 && authorPart.indexOf('et al') === -1) {
        warnings.push('רשומה ' + index + ': כשיש מספר מחברים, יש להשתמש ב-& לפני המחבר האחרון - "' + refPreview + '"');
      }
    }
  }

  // בדיקה 4: DOI - APA7 דורש DOI כאשר זמין
  if (isEnglish && ref.toLowerCase().indexOf('doi') === -1 &&
      ref.indexOf('https://doi.org') === -1 &&
      ref.indexOf('http') === -1) {
    // ייתכן שזה ספר ולא מאמר - רק אזהרה
    if (/journal|review|quarterly|bulletin/i.test(ref)) {
      warnings.push('רשומה ' + index + ': מאמר בכתב עת - ודא שנכלל DOI אם זמין (APA7) - "' + refPreview + '"');
    }
  }

  // בדיקה 5: פורמט DOI ב-APA7 - צריך להיות https://doi.org/
  if (/doi:\s*10\./i.test(ref) || /DOI\s*10\./i.test(ref)) {
    errors.push('רשומה ' + index + ': ב-APA7 יש לכתוב DOI בפורמט: https://doi.org/10.xxxx (ולא doi: 10.xxxx) - "' + refPreview + '"');
  }

  // בדיקה 6: et al בביבליוגרפיה
  if (/et al\.?/i.test(ref)) {
    // ב-APA7, ברשימת המקורות יש לרשום עד 20 מחברים (לא et al)
    warnings.push('רשומה ' + index + ': ב-APA7 יש לרשום את כל המחברים ברשימת המקורות (עד 20). השימוש ב-et al. הוא רק בגוף הטקסט - "' + refPreview + '"');
  }

  // בדיקה 7: Retrieved from (שינוי מ-APA6 ל-APA7)
  if (/retrieved from/i.test(ref)) {
    warnings.push('רשומה ' + index + ': ב-APA7 לא משתמשים ב-"Retrieved from" - פשוט כתוב את הכתובת - "' + refPreview + '"');
  }

  // בדיקה 8: כותרת באיטליק (לא ניתן לבדוק פורמט, אבל בודקים נוכחות כותרת)
  if (isEnglish) {
    var afterYear = ref.split(/\)\.\s*/)[1];
    if (afterYear && afterYear.trim().length < 3) {
      errors.push('רשומה ' + index + ': ייתכן שחסרה כותרת אחרי השנה - "' + refPreview + '"');
    }
  }

  return { errors: errors, warnings: warnings };
}

/**
 * בודק סדר אלפביתי של רשומות
 */
function checkAlphabeticalOrder(references, result) {
  if (references.length < 2) return;

  var outOfOrder = [];
  for (var i = 1; i < references.length; i++) {
    var prev = references[i - 1].trim().toLowerCase();
    var curr = references[i].trim().toLowerCase();

    // השוואת האותיות הראשונות
    if (curr < prev) {
      outOfOrder.push(i + 1);
    }
  }

  if (outOfOrder.length === 0) {
    result.findings.push('הרשומות מסודרות בסדר אלפביתי - תקין');
  } else if (outOfOrder.length <= 3) {
    result.warnings.push('רשומות שייתכן ואינן בסדר אלפביתי: מספרי רשומות ' + outOfOrder.join(', '));
  } else {
    result.errors.push('הביבליוגרפיה אינה מסודרת בסדר אלפביתי. יש לסדר את הרשומות לפי שם המשפחה של המחבר הראשון');
  }
}

/**
 * בדיקות כלליות של הביבליוגרפיה
 */
function checkGeneralAPARules(references, result) {
  // בדיקת כמות מקורות
  if (references.length < 5) {
    result.warnings.push('מספר המקורות נמוך (' + references.length + '). בדרך כלל הצעת מחקר לתואר ראשון כוללת לפחות 10-15 מקורות');
  } else if (references.length < 10) {
    result.warnings.push('מספר המקורות סביר (' + references.length + ') אך מומלץ לשאוף ל-15+ מקורות');
  } else {
    result.findings.push('מספר מקורות תקין: ' + references.length);
  }

  // בדיקת מגוון שפות
  var hebrewRefs = 0;
  var englishRefs = 0;
  for (var i = 0; i < references.length; i++) {
    if (/^[A-Z]/.test(references[i].trim())) {
      englishRefs++;
    } else if (/^[\u0590-\u05FF]/.test(references[i].trim())) {
      hebrewRefs++;
    }
  }

  if (hebrewRefs > 0 && englishRefs > 0) {
    result.findings.push('נמצאו מקורות בעברית (' + hebrewRefs + ') ובאנגלית (' + englishRefs + ') - מגוון תקין');
  } else if (englishRefs === 0 && hebrewRefs > 0) {
    result.warnings.push('כל המקורות בעברית. מומלץ לכלול גם מקורות באנגלית');
  }

  // בדיקת עדכניות מקורות
  var currentYear = new Date().getFullYear();
  var oldRefs = 0;
  var recentRefs = 0;
  for (var j = 0; j < references.length; j++) {
    var yearMatch = references[j].match(/\((\d{4})/);
    if (yearMatch) {
      var year = parseInt(yearMatch[1]);
      if (year < currentYear - 15) oldRefs++;
      if (year >= currentYear - 5) recentRefs++;
    }
  }

  if (oldRefs > references.length / 2) {
    result.warnings.push('חלק ניכר מהמקורות ישנים (מעל 15 שנה). מומלץ לעדכן עם מחקרים עדכניים יותר');
  }
  if (recentRefs >= 3) {
    result.findings.push('נמצאו ' + recentRefs + ' מקורות עדכניים (5 שנים אחרונות)');
  } else {
    result.warnings.push('מומלץ לכלול יותר מקורות עדכניים (מ-5 השנים האחרונות)');
  }
}
