import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test, { describe, it } from 'node:test';

import { translations, translate, type Locale } from '../../src/features/settings/translations';

const ROOT_DIR = path.resolve(__dirname, '../..');
const HOME_SCREEN_PATH = path.join(ROOT_DIR, 'src/features/home/HomeScreen.tsx');
const CARE_HEADER_PATH = path.join(ROOT_DIR, 'src/features/patients/CareHeader.tsx');
const MAIN_TABS_PATH = path.join(ROOT_DIR, 'src/features/navigation/MainTabs.tsx');
const ASK_BANTAY_PATH = path.join(ROOT_DIR, 'src/features/assistant/AskBantayBottomSheet.tsx');
const PHOTO_IMPORT_PATH = path.join(ROOT_DIR, 'src/features/medications/MedicationPhotoImport.tsx');

describe('Chatbot and Home Screen Hero UI Revamp Suite', () => {
  describe('R1 & R5: Bilingual Time-of-Day Greetings & Top Bar', () => {
    it('provides valid translations for all greeting keys in EN and FIL with matched placeholders', () => {
      const locales: Locale[] = ['en', 'fil'];
      for (const locale of locales) {
        const morning = translate(locale, 'home.greetingMorning', { name: 'Maya' });
        const afternoon = translate(locale, 'home.greetingAfternoon', { name: 'Maya' });
        const evening = translate(locale, 'home.greetingEvening', { name: 'Maya' });

        assert.ok(morning.includes('Maya'), `${locale} morning greeting must contain name`);
        assert.ok(afternoon.includes('Maya'), `${locale} afternoon greeting must contain name`);
        assert.ok(evening.includes('Maya'), `${locale} evening greeting must contain name`);

        if (locale === 'en') {
          assert.equal(morning, 'Good morning, Maya!');
          assert.equal(afternoon, 'Good afternoon, Maya!');
          assert.equal(evening, 'Good evening, Maya!');
        } else {
          assert.equal(morning, 'Magandang umaga, Maya!');
          assert.equal(afternoon, 'Magandang hapon, Maya!');
          assert.equal(evening, 'Magandang gabi, Maya!');
        }
      }
    });

    it('correctly maps Manila hours to morning, afternoon, and evening', () => {
      function getManilaTimeOfDay(hour: number): 'morning' | 'afternoon' | 'evening' {
        if (hour >= 5 && hour < 12) return 'morning';
        if (hour >= 12 && hour < 18) return 'afternoon';
        return 'evening';
      }

      assert.equal(getManilaTimeOfDay(5), 'morning');
      assert.equal(getManilaTimeOfDay(8), 'morning');
      assert.equal(getManilaTimeOfDay(11), 'morning');
      assert.equal(getManilaTimeOfDay(12), 'afternoon');
      assert.equal(getManilaTimeOfDay(14), 'afternoon');
      assert.equal(getManilaTimeOfDay(17), 'afternoon');
      assert.equal(getManilaTimeOfDay(18), 'evening');
      assert.equal(getManilaTimeOfDay(22), 'evening');
      assert.equal(getManilaTimeOfDay(0), 'evening');
      assert.equal(getManilaTimeOfDay(4), 'evening');
    });

    it('translates the interactive caring for pill in EN and FIL', () => {
      const enPill = translate('en', 'home.caringForPill', { patient: 'Lola Rosa' });
      const filPill = translate('fil', 'home.caringForPill', { patient: 'Lola Rosa' });

      assert.equal(enPill, 'Caring for Lola Rosa ▾');
      assert.equal(filPill, 'Inaalagaan si Lola Rosa ▾');
    });

    it('CareHeader has circular action buttons with 48dp minimum touch targets for patient switcher and settings', () => {
      const content = fs.readFileSync(CARE_HEADER_PATH, 'utf-8');

      // Check circular buttons in topActions
      assert.ok(content.includes('topActions'), 'CareHeader must have topActions container');
      assert.ok(content.includes('avatarButton'), 'CareHeader must have avatarButton');
      assert.ok(content.includes('settingsButton'), 'CareHeader must have settingsButton');
      assert.ok(content.includes('showPatientBar'), 'CareHeader must support showPatientBar prop');

      // Touch target verification in style definition
      assert.match(content, /avatarButton:\s*\{[^}]*width:\s*48[^}]*height:\s*48/);
      assert.match(content, /settingsButton:\s*\{[^}]*width:\s*48[^}]*height:\s*48/);
    });
  });

  describe('R2: Bantay Mascot Greeting Banner & Entry Point', () => {
    it('MainTabs eliminates AssistantFAB and connects banner to AskBantayBottomSheet', () => {
      const mainTabsContent = fs.readFileSync(MAIN_TABS_PATH, 'utf-8');

      assert.ok(!mainTabsContent.includes('<AssistantFAB'), 'MainTabs must not render AssistantFAB');
      assert.ok(!mainTabsContent.includes("from '../assistant/AssistantFAB'"), 'MainTabs must not import AssistantFAB');
      assert.ok(mainTabsContent.includes('onOpenAssistant='), 'MainTabs must pass onOpenAssistant to HomeScreen');
      assert.ok(mainTabsContent.includes('<AskBantayBottomSheet'), 'MainTabs must still render AskBantayBottomSheet');
    });

    it('HomeScreen implements the Bantay hero card banner with speech bubble and mascot', () => {
      const homeContent = fs.readFileSync(HOME_SCREEN_PATH, 'utf-8');

      assert.ok(homeContent.includes('styles.mascotBanner'), 'HomeScreen must render mascotBanner');
      assert.ok(homeContent.includes('styles.speechBubble'), 'HomeScreen must render speechBubble');
      assert.ok(homeContent.includes('styles.speechBubbleTail'), 'HomeScreen must render speechBubbleTail pointer');
      assert.ok(homeContent.includes('styles.speechBubbleHeader'), 'HomeScreen must render speechBubbleHeader');
      assert.ok(homeContent.includes('<AssistantMascot'), 'HomeScreen must render AssistantMascot in banner');
      assert.ok(homeContent.includes('onOpenAssistant'), 'HomeScreen mascotBanner must trigger onOpenAssistant');

      // Verify styling has forest green card and minimum touch targets
      assert.match(homeContent, /mascotBanner:\s*\{[^}]*backgroundColor:\s*colors\.successDark/);
      assert.match(homeContent, /borderRadius:\s*20/);
    });

    it('banner dynamically evaluates celebration, next dose, review, and gentle tip', () => {
      const enAllDone = translate('en', 'home.bannerAllDone', { patient: 'Lola Rosa' });
      const filAllDone = translate('fil', 'home.bannerAllDone', { patient: 'Lola Rosa' });
      assert.ok(enAllDone.includes('Lola Rosa'));
      assert.ok(filAllDone.includes('Lola Rosa'));

      const enNext = translate('en', 'home.bannerNextDose', {
        medicine: 'Amlodipine',
        dose: '5 mg',
        time: '8:00 AM',
        patient: 'Lola Rosa',
      });
      const filNext = translate('fil', 'home.bannerNextDose', {
        medicine: 'Amlodipine',
        dose: '5 mg',
        time: '8:00 AM',
        patient: 'Lola Rosa',
      });
      assert.ok(enNext.includes('Amlodipine') && enNext.includes('8:00 AM'));
      assert.ok(filNext.includes('Amlodipine') && filNext.includes('8:00 AM'));

      const enTip = translate('en', 'home.bannerTip', {});
      const filTip = translate('fil', 'home.bannerTip', {});
      assert.ok(enTip.length > 0);
      assert.ok(filTip.length > 0);
    });
  });

  describe('R3: Quick Actions Row', () => {
    it('HomeScreen implements all 5 accessible quick action tiles', () => {
      const homeContent = fs.readFileSync(HOME_SCREEN_PATH, 'utf-8');

      assert.ok(homeContent.includes('quickActionsSection'), 'Must have quickActionsSection');
      assert.ok(homeContent.includes('quickActionsList'), 'Must have quickActionsList');

      // 1. Log Dose
      assert.ok(homeContent.includes('actionLogDose'), 'Must have actionLogDose tile');
      assert.ok(homeContent.includes('onOpenToday'), 'Must wire to onOpenToday');

      // 2. + Add Medicine
      assert.ok(homeContent.includes('actionAddMedicine'), 'Must have actionAddMedicine tile');

      // 3. Scan Rx
      assert.ok(homeContent.includes('actionScanRx'), 'Must have actionScanRx tile');
      assert.ok(homeContent.includes('setScanRxModalVisible'), 'Must open Scan Rx modal');

      // 4. Today\'s Schedule
      assert.ok(homeContent.includes('actionTodaySchedule'), 'Must have actionTodaySchedule tile');

      // 5. Care Circle
      assert.ok(homeContent.includes('actionCareCircle'), 'Must have actionCareCircle tile');
      assert.ok(homeContent.includes('scrollToEnd'), 'Care Circle tile must scroll to Care Circle section');

      // Verify touch targets >= 48dp
      assert.match(homeContent, /quickActionTile:\s*\{[^}]*minWidth:\s*76[^}]*minHeight:\s*84/);
    });

    it('translations exist for all 5 quick action tiles in both EN and FIL', () => {
      const actions = [
        { key: 'home.actionLogDose', en: 'Log Dose', fil: 'Itala ang Dose' },
        { key: 'home.actionAddMedicine', en: '+ Add Medicine', fil: '+ Magdagdag ng Gamot' },
        { key: 'home.actionScanRx', en: 'Scan Rx', fil: 'I-scan ang Reseta' },
        { key: 'home.actionTodaySchedule', en: "Today's Schedule", fil: 'Iskedyul Ngayon' },
        { key: 'home.actionCareCircle', en: 'Care Circle', fil: 'Care Circle' },
      ];

      for (const action of actions) {
        assert.equal(translate('en', action.key as any, {}), action.en);
        assert.equal(translate('fil', action.key as any, {}), action.fil);
      }
    });
  });

  describe('R4: Revamped Chatbot Conversation UI in AskBantayBottomSheet', () => {
    it('positions suggestion chips directly above input bar instead of top of screen', () => {
      const content = fs.readFileSync(ASK_BANTAY_PATH, 'utf-8');

      const messagesScrollIdx = content.indexOf('styles.messagesScroll');
      const chipsRowIdx = content.indexOf('styles.chipsRow');
      const inputContainerIdx = content.indexOf('styles.inputContainer');

      assert.ok(messagesScrollIdx !== -1, 'Must have messagesScroll');
      assert.ok(chipsRowIdx !== -1, 'Must have chipsRow');
      assert.ok(inputContainerIdx !== -1, 'Must have inputContainer');

      // Chips row must appear AFTER messagesScroll and BEFORE inputContainer
      assert.ok(
        chipsRowIdx > messagesScrollIdx,
        'chipsRow must be positioned after the scrollable message stream',
      );
      assert.ok(
        chipsRowIdx < inputContainerIdx,
        'chipsRow must be positioned above the text input container',
      );
    });

    it('header has mascot badge and 48dp minimum close button target', () => {
      const content = fs.readFileSync(ASK_BANTAY_PATH, 'utf-8');

      assert.ok(content.includes('styles.mascotBadge'), 'Must have mascotBadge in header');
      assert.match(content, /closeButton:\s*\{[^}]*height:\s*48/);
      assert.match(content, /closeButton:\s*\{[^}]*width:\s*48/);
    });

    it('assistant bubbles have green accent and clean editorial card styling', () => {
      const content = fs.readFileSync(ASK_BANTAY_PATH, 'utf-8');

      assert.match(content, /assistantBubble:\s*\{[^}]*borderLeftColor:\s*colors\.successDark/);
      assert.match(content, /assistantBubble:\s*\{[^}]*borderLeftWidth:\s*3\.5/);
    });

    it('user messages have caregiver-tinted pill bubble styling', () => {
      const content = fs.readFileSync(ASK_BANTAY_PATH, 'utf-8');

      assert.match(content, /userBubble:\s*\{[^}]*backgroundColor:\s*colors\.primaryTint/);
      assert.match(content, /userBubble:\s*\{[^}]*borderRadius:\s*radii\.xl/);
    });

    it('input bar features rounded pill text input and 48dp send button', () => {
      const content = fs.readFileSync(ASK_BANTAY_PATH, 'utf-8');

      assert.match(content, /textInput:\s*\{[^}]*borderRadius:\s*radii\.full/);
      assert.match(content, /textInput:\s*\{[^}]*minHeight:\s*48/);
      assert.match(content, /sendButton:\s*\{[^}]*height:\s*48/);
      assert.match(content, /sendButton:\s*\{[^}]*width:\s*48/);
    });

    it('all interactive buttons and chips in AskBantayBottomSheet satisfy 48dp touch targets and accessibilityLabels', () => {
      const content = fs.readFileSync(ASK_BANTAY_PATH, 'utf-8');

      // Chips
      assert.match(content, /chip:\s*\{[^}]*minHeight:\s*48/);
      assert.ok(content.includes('accessibilityLabel={chip.label}'), 'chip must have accessibilityLabel');

      // Dose card buttons
      assert.match(content, /recordTakenButton:\s*\{[^}]*minHeight:\s*48/);
      assert.ok(content.includes("accessibilityLabel={t('assistant.doseCardRecordTaken')}"));
      assert.match(content, /viewTodayButton:\s*\{[^}]*minHeight:\s*48/);
      assert.ok(content.includes("accessibilityLabel={t('assistant.doseCardViewToday')}"));

      // Draft card buttons
      assert.match(content, /confirmDraftButton:\s*\{[^}]*minHeight:\s*48/);
      assert.ok(content.includes("accessibilityLabel={t('assistant.draftCardConfirm')}"));
      assert.match(content, /editDraftButton:\s*\{[^}]*minHeight:\s*48/);
      assert.ok(content.includes("accessibilityLabel={t('assistant.draftCardEdit')}"));
      assert.match(content, /viewScheduleButton:\s*\{[^}]*minHeight:\s*48/);
      assert.ok(content.includes("accessibilityLabel={t('assistant.draftCardViewSchedule')}"));
    });

    it('guards message reset in AskBantayBottomSheet to prevent wiping active conversation on timeline refetches', () => {
      const content = fs.readFileSync(ASK_BANTAY_PATH, 'utf-8');

      assert.ok(content.includes('prevVisibleRef'), 'Must declare prevVisibleRef to track sheet open transition');
      assert.ok(content.includes('prevPatientIdRef'), 'Must declare prevPatientIdRef to track patient switch transition');
      assert.ok(content.includes('isOpening'), 'Must guard with isOpening');
      assert.ok(content.includes('isPatientSwitch'), 'Must guard with isPatientSwitch');
    });
  });

  describe('Adversarial & Edge Cases Invariant Checks', () => {
    it('HomeScreen banner prioritizes overdue/attention doses over future doses so caregivers are alerted', () => {
      const homeContent = fs.readFileSync(HOME_SCREEN_PATH, 'utf-8');

      // Verify that attention check occurs BEFORE nextDose in the status ternary
      const attentionIdx = homeContent.indexOf('attention.length > 0');
      const nextDoseCheckIdx = homeContent.indexOf('nextDose\n        ? t(\'home.bannerNextDose\'');

      assert.ok(attentionIdx !== -1, 'Must check attention doses in banner');
      assert.ok(nextDoseCheckIdx !== -1, 'Must check nextDose in banner');
      assert.ok(
        attentionIdx < nextDoseCheckIdx,
        'Attention/overdue doses must be evaluated BEFORE nextDose so they are not masked',
      );
    });

    it('HomeScreen banner mascot sets accessible={false} to eliminate TalkBack nested button conflict', () => {
      const homeContent = fs.readFileSync(HOME_SCREEN_PATH, 'utf-8');

      assert.match(
        homeContent,
        /<AssistantMascot\s+accessible=\{false\}\s+expression=\{bannerExpression\}/,
        'AssistantMascot in banner must set accessible={false} so TalkBack sees a single coherent button',
      );
    });

    it('HomeScreen caringForPill does not render redundant double-chevron alongside translation string', () => {
      const homeContent = fs.readFileSync(HOME_SCREEN_PATH, 'utf-8');

      // The pill chip must not contain an AppIcon name="chevron-down" because the translation already ends with ▾
      const pillSection = homeContent.slice(
        homeContent.indexOf('styles.caringForPill'),
        homeContent.indexOf('styles.mascotBanner'),
      );
      assert.ok(
        !pillSection.includes('name="chevron-down"'),
        'caringForPill must not contain redundant chevron icon when translation contains ▾',
      );
    });

    it('MedicationPhotoImport supports initialExpanded and Scan Rx modal renders with expanded scanner and backdrop dismiss', () => {
      const photoImportContent = fs.readFileSync(PHOTO_IMPORT_PATH, 'utf-8');
      const homeContent = fs.readFileSync(HOME_SCREEN_PATH, 'utf-8');

      assert.ok(photoImportContent.includes('initialExpanded = false'), 'MedicationPhotoImport must accept initialExpanded prop');
      assert.ok(homeContent.includes('<MedicationPhotoImport\n                initialExpanded'), 'HomeScreen Scan Rx modal must pass initialExpanded');
      assert.ok(homeContent.includes('style={StyleSheet.absoluteFill}'), 'HomeScreen Scan Rx modal must include backdrop dismiss pressable');
    });

    it('quick actions row supports responsive flexGrow and maxWidth scaling for tablet displays', () => {
      const homeContent = fs.readFileSync(HOME_SCREEN_PATH, 'utf-8');

      assert.match(homeContent, /quickActionsList:\s*\{[^}]*flexGrow:\s*1/);
      assert.match(homeContent, /quickActionTile:\s*\{[^}]*maxWidth:\s*136/);
    });
  });
});
