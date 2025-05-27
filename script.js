const firebaseConfig = {
            apiKey: "AIzaSyDi1haSmovGJP7lGl4Iqh4SaNW-pEUSgBY",
            authDomain: "playplx-99.firebaseapp.com",
            projectId: "playplx-99",
            storageBucket: "playplx-99.appspot.com",
            messagingSenderId: "283950407329",
            appId: "1:283950407329:web:49815310516a259c555ae0"
        };

        firebase.initializeApp(firebaseConfig);
        const db = firebase.firestore();

        const quizApp = {
            quizData: [],
            currentQuestion: 0,
            userAnswers: [],
            markedQuestions: new Set(),
            totalTimer: null,
            totalTime: 0,
            startTime: 0,
            questionCount: 20,
            testDuration: 30,
            markedOnly: false,
            autoAdvance: false,
            freeRunnerMode: false,
            allQuestions: [],
            resultsChart: null,
            timePerQuestion: [],
            currentStreak: 0,
            emergencyPauseUsed: 0,
            emergencyPauseAllowed: 1,
            emergencyPauseActive: false,
            emergencyPauseStartTime: 0,
            pauseTimer: null,
            questionTimes: [], // Array to store question completion times
            timeStandardValue: 0,
            timeDifferenceValue: 0,
            
            init() {
                this.addEventListeners();
                this.updateMarkedCount();
                this.updateTimePerQuestion();
                this.updateMasteryRequirements();
                this.initQuestionTypesChart();
                this.initMasteryDistributionChart();
                this.setupTypeSliders();
                this.timePerQuestion = [];
                this.currentStreak = 0;
                this.highestStreak = 0;
                this.questionTimes = [];
                this.timeStandardValue = 0;
                this.timeDifferenceValue = 0;
                
                // إعادة تعيين عداد الإيقافات الطارئة عند بدء التطبيق
                this.emergencyPauseUsed = 0;
                
                // إضافة مستمع للضغط على المؤقت للإيقاف الطارئ
                this.setupEmergencyPause();
            },
            
            async initMasteryDistributionChart() {
                try {
                    // Fetch all questions from Firebase
                    const snapshot = await db.collection('questions').get();
                    const masteryGroups = {};

                    // Initialize all possible percentages from 0 to 100
                    for (let i = 0; i <= 100; i++) {
                        masteryGroups[i] = 0;
                    }

                    // Process each question
                    snapshot.forEach(doc => {
                        const question = doc.data();
                        const masteryPercent = Math.round(this.calculateMastery(question.stats));
                        masteryGroups[masteryPercent]++;
                    });

                    const ctx = document.getElementById('masteryDistributionChart').getContext('2d');
                    
                    if (this.masteryChart) {
                        this.masteryChart.destroy();
                    }

                    // Create arrays for labels and data
                    const labels = Object.keys(masteryGroups);
                    const data = Object.values(masteryGroups);

                    // Find max value for setting appropriate step size
                    const maxValue = Math.max(...data);
                    const stepSize = this.calculateStepSize(maxValue);

                    // Create color gradient from red to green
                    const colors = labels.map(percent => {
                        const hue = (percent * 1.2); // multiply by 1.2 to get to green (120)
                        return `hsl(${hue}, 80%, 50%)`;
                    });

                    this.masteryChart = new Chart(ctx, {
                        type: 'bar',
                        data: {
                            labels: labels.map(l => l + '%'),
                            datasets: [{
                                label: 'عدد الأسئلة',
                                data: data,
                                backgroundColor: colors,
                                borderWidth: 0,
                                borderRadius: 5,
                                barPercentage: 1,
                                categoryPercentage: 1
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: {
                                    display: false
                                },
                                tooltip: {
                                    callbacks: {
                                        title: function(context) {
                                            return `نسبة الإتقان: ${context[0].label}`;
                                        },
                                        label: function(context) {
                                            const count = context.raw;
                                            return `عدد الأسئلة: ${count}`;
                                        }
                                    }
                                }
                            },
                            scales: {
                                y: {
                                    beginAtZero: true,
                                    ticks: {
                                        stepSize: stepSize,
                                        color: 'white',
                                        callback: function(value) {
                                            if (value % stepSize === 0) {
                                                return value;
                                            }
                                        }
                                    },
                                    grid: {
                                        color: 'rgba(255, 255, 255, 0.1)'
                                    },
                                    title: {
                                        display: true,
                                        text: 'عدد الأسئلة',
                                        color: 'white'
                                    },
                                    suggestedMax: maxValue + (stepSize - (maxValue % stepSize))
                                },
                                x: {
                                    ticks: {
                                        color: 'white',
                                        autoSkip: true,
                                        maxRotation: 0,
                                        minRotation: 0,
                                        callback: function(value, index) {
                                            // Show only every 10th label for better readability
                                            return index % 10 === 0 ? this.getLabelForValue(value) : '';
                                        }
                                    },
                                    grid: {
                                        display: false
                                    },
                                    title: {
                                        display: true,
                                        text: 'نسبة الإتقان',
                                        color: 'white'
                                    }
                                }
                            }
                        }
                    });
                } catch (error) {
                    console.error('Error initializing mastery distribution chart:', error);
                }
            },

            calculateStepSize(maxValue) {
                if (maxValue <= 10) return 1;
                if (maxValue <= 50) return 5;
                if (maxValue <= 100) return 10;
                if (maxValue <= 500) return 50;
                if (maxValue <= 1000) return 100;
                return Math.ceil(maxValue / 10);
            },

            // Update the mastery distribution chart when needed
            async updateMasteryDistributionChart() {
                await this.initMasteryDistributionChart();
            },
            
            updateTimePerQuestion() {
                const questionCount = parseInt(document.getElementById('questionCount').value) || 20;
                const testDuration = parseInt(document.getElementById('testDuration').value) || 30;
                
                const totalSeconds = testDuration * 60;
                const secondsPerQuestion = Math.floor(totalSeconds / questionCount);
                
                const minutes = Math.floor(secondsPerQuestion / 60);
                const seconds = secondsPerQuestion % 60;
                
                const timeText = minutes > 0 
                    ? `${minutes}:${seconds.toString().padStart(2, '0')} دقيقة` 
                    : `${seconds} ثانية`;
                
                document.getElementById('timePerQuestion').textContent = `الوقت المخصص لكل سؤال: ${timeText}`;
            },
            
            async updateMasteryRequirements() {
                try {
                    // Fetch all questions from Firebase
                    const snapshot = await db.collection('questions').get();
                    let totalRequiredCorrect = 0;
                    let totalQuestions = 0;
                    
                    // Process each question
                    snapshot.forEach(doc => {
                        const question = doc.data();
                        if (question.stats) {
                            totalQuestions++;
                            
                            const attempts = question.stats.attempts || 0;
                            const correct = question.stats.correct || 0;
                            const incorrect = attempts - correct;
                            
                            // Base requirement: 4 correct answers for a question with no errors
                            const baseRequirement = 4;
                            
                            // Calculate required correct answers based on number of incorrect answers
                            // For each incorrect answer, we add 3 more required correct answers
                            const requiredCorrect = baseRequirement + (incorrect * 3);
                            
                            // If we've already met or exceeded the requirement, no more needed
                            if (correct >= requiredCorrect) {
                                // Already mastered
                            } else {
                                // Add the remaining needed correct answers to the total
                                totalRequiredCorrect += (requiredCorrect - correct);
                            }
                        }
                    });
                    
                    // Update the UI
                    document.getElementById('requiredCorrectAnswers').textContent = totalRequiredCorrect;
                    document.getElementById('totalQuestionsCount').textContent = totalQuestions;
                } catch (error) {
                    console.error('Error calculating mastery requirements:', error);
                    document.getElementById('requiredCorrectAnswers').textContent = '?';
                }
            },
            
            async updateMarkedCount() {
                try {
                    const snapshot = await db.collection('questions')
                        .where('stats.marked', '==', true)
                        .get();
                    
                    const markedCount = snapshot.size;
                    document.getElementById('markedCount').textContent = `(${markedCount})`;
                } catch (error) {
                    console.error('Error fetching marked questions count:', error);
                }
            },
            
            addEventListeners() {
                document.getElementById('startQuizBtn').addEventListener('click', () => this.startQuiz());
                document.getElementById('prevBtn').addEventListener('click', () => this.previousQuestion());
                document.getElementById('nextBtn').addEventListener('click', () => this.nextQuestion());
                document.getElementById('submitBtn').addEventListener('click', () => this.showResults());
                document.getElementById('restartQuizBtn').addEventListener('click', () => this.restartQuiz());
                document.getElementById('copyAllMarkedBtn').addEventListener('click', () => this.copyAllMarked());
                
                // Extract comprehension button feature removed
                
                document.getElementById('maxMasteryLimit').addEventListener('input', (e) => {
                    let value = parseInt(e.target.value) || 0;
                    value = Math.min(Math.max(0, value), 100);
                    e.target.value = value;
                });
                
                // Add refresh button for mastery requirements
                document.getElementById('masteryInfoContainer').addEventListener('click', () => {
                    // Visual feedback that we're refreshing
                    document.getElementById('requiredCorrectAnswers').textContent = '...';
                    document.getElementById('totalQuestionsCount').textContent = '...';
                    // Update the mastery requirements
                    this.updateMasteryRequirements();
                });
                
                document.getElementById('questionCount').addEventListener('input', (e) => {
                    this.questionCount = Math.min(Math.max(5, parseInt(e.target.value) || 20), 6000);
                    e.target.value = this.questionCount;
                    this.updateTimePerQuestion();
                });
                
                document.getElementById('testDuration').addEventListener('input', (e) => {
                    this.testDuration = Math.min(Math.max(1, parseInt(e.target.value) || 30), 1000);
                    e.target.value = this.testDuration;
                    this.updateTimePerQuestion();
                });
                
                document.getElementById('markedOnly').addEventListener('change', (e) => {
                    this.markedOnly = e.target.checked;
                    
                    // Disable excludeMarked checkbox if markedOnly is checked (they're mutually exclusive)
                    if (e.target.checked) {
                        document.getElementById('excludeMarked').checked = false;
                        document.getElementById('excludeMarked').disabled = true;
                    } else {
                        document.getElementById('excludeMarked').disabled = false;
                    }
                });
                
                document.getElementById('excludeMarked').addEventListener('change', (e) => {
                    this.excludeMarked = e.target.checked;
                    
                    // Disable markedOnly checkbox if excludeMarked is checked (they're mutually exclusive)
                    if (e.target.checked) {
                        document.getElementById('markedOnly').checked = false;
                        document.getElementById('markedOnly').disabled = true;
                    } else {
                        document.getElementById('markedOnly').disabled = false;
                    }
                });
                
                document.getElementById('autoAdvance').addEventListener('change', (e) => {
                    this.autoAdvance = e.target.checked;
                });
                
                document.getElementById('freeRunnerMode').addEventListener('change', (e) => {
                    this.freeRunnerMode = e.target.checked;
                    
                    document.getElementById('freeRunnerInfo').style.display = e.target.checked ? 'block' : 'none';
                    
                    document.getElementById('testDuration').disabled = e.target.checked;
                    document.getElementById('timePerQuestion').style.opacity = e.target.checked ? '0.5' : '1';
                });
                
                document.getElementById('stealthMode').addEventListener('change', (e) => {
                    // Add any additional logic you want to execute when stealth mode changes
                    console.log('Stealth mode:', e.target.checked);
                });
                
                window.addEventListener('resize', () => {
                    if (document.querySelector('.quiz-page.active-page')) {
                        this.updateLayout();
                    }
                });
                
                // Add numpad keyboard shortcuts
                window.addEventListener('keydown', (e) => {
                    // Only process keyboard shortcuts when in quiz mode
                    if (!document.querySelector('.quiz-page.active-page')) return;
                    
                    // Check the key pressed
                    const key = e.key;
                    
                    switch (key) {
                        case '7': // Numpad 7 = Mark/unmark question
                            this.toggleMarkQuestion();
                            break;
                        case '8': // Numpad 8 = Delete question mastery
                            this.deleteQuestionMastery();
                            break;
                        case '9': // Numpad 9 = Set question mastery
                            this.setQuestionMastery();
                            break;
                        case 'Enter': // Enter = Next question
                            this.nextQuestion();
                            break;
                        case '.': // Period/dot = Previous question
                            this.previousQuestion();
                            break;
                    }
                });
            },

            async startQuiz() {
                this.quizData = [];
                this.userAnswers = [];
                this.markedQuestions = new Set();
                this.currentQuestion = 0;
                this.timePerQuestion = [];
                this.currentStreak = 0;
                this.highestStreak = 0;
                
                this.questionCount = parseInt(document.getElementById('questionCount').value) || 20;
                this.testDuration = parseInt(document.getElementById('testDuration').value) || 30;
                this.markedOnly = document.getElementById('markedOnly').checked;
                this.excludeMarked = document.getElementById('excludeMarked').checked;
                this.autoAdvance = document.getElementById('autoAdvance').checked;
                this.freeRunnerMode = document.getElementById('freeRunnerMode').checked;
                this.maxMasteryLimit = parseInt(document.getElementById('maxMasteryLimit').value) || 100;
                
                // إعادة تعيين عداد الإيقافات الطارئة مع كل اختبار جديد
                this.emergencyPauseUsed = 0;
                // حساب عدد الإيقافات المسموح بها بناءً على العدد الإجمالي للأسئلة (إيقاف واحد لكل 1000 سؤال)
                this.emergencyPauseAllowed = Math.max(1, Math.floor(this.questionCount / 1000));
                this.emergencyPauseActive = false;
                
                document.getElementById('streakCounter').style.display = 'none';
                document.getElementById('streakCount').textContent = '0';
                
                try {
                    await this.fetchQuestions();
                    
                    if (this.quizData.length === 0) {
                        this.showCustomAlert({
                            icon: '❌',
                            title: 'تنبيه',
                            content: 'لم يتم العثور على أسئلة مناسبة. يرجى تعديل نسبة الإتقان أو الاختيارات وإعادة المحاولة.',
                            confirmText: 'حسناً',
                            showCancel: false
                        });
                        return;
                    }
                    
                    this.userAnswers = new Array(this.quizData.length).fill(-1);
                    this.currentQuestion = 0;
                    this.totalTime = this.testDuration * 60;
                    this.startTime = Date.now();
                    this.markedQuestions = new Set();
                    
                    this.quizData.forEach((q, index) => {
                        if (q.stats && q.stats.marked) {
                            this.markedQuestions.add(index);
                        }
                    });
                    
                    this.switchPage('quiz-page');
                    this.updateLayout();
                    
                    document.getElementById('submitBtn').style.display = this.freeRunnerMode ? 'block' : 'none';
                    
                    if (!this.freeRunnerMode) {
                        this.startTotalTimer();
                    } else {
                        document.getElementById('totalTimer').textContent = 'الوضع الحر - غير محدد بوقت';
                    }
                    
                    this.updateProgress();
                    this.renderQuestion();
                    
                    document.getElementById('statsWidget').style.display = 'block';
                } catch (error) {
                    this.showCustomAlert({
                        icon: '❌',
                        title: 'خطأ',
                        content: 'حدث خطأ أثناء تحميل الأسئلة. يرجى المحاولة مرة أخرى.',
                        confirmText: 'حسناً',
                        showCancel: false
                    });
                    console.error(error);
                }
            },

            async fetchQuestions() {
                // Step 1: Fetch all questions from the database
                let query = db.collection('questions');
                
                // Apply marked filter if needed
                if (this.markedOnly) {
                    query = query.where('stats.marked', '==', true);
                }
                
                const snapshot = await query.get();
                let allQuestions = [];
                
                // Step 2: Apply mastery limit filter and exclude marked questions if needed
                snapshot.forEach(doc => {
                    const data = doc.data();
                    const stats = data.stats || {};
                    stats.attempts = stats.attempts || 0;
                    stats.correct = stats.correct || 0;
                    stats.marked = stats.marked || false;
                    
                    const masteryPercent = this.calculateMastery(stats);
                    
                    // Skip marked questions if excludeMarked is true
                    if (this.excludeMarked && stats.marked) {
                        return;
                    }
                    
                    // Only include questions with mastery below or equal to the limit
                    if (masteryPercent <= this.maxMasteryLimit) {
                        allQuestions.push({
                            id: doc.id,
                            ...data,
                            stats: stats,
                            masteryPercent: masteryPercent
                        });
                    }
                });
                
                if (allQuestions.length === 0) {
                    return;
                }
                
                // Step 3: Apply type distribution filtering
                // If a slider is removed or set to 0, that type won't be included
                if (!this.markedOnly) {
                    const typePercentages = this.getQuestionTypePercentages();
                    
                    // Filter questions by type
                    const errorQuestions = typePercentages.error > 0 ? 
                        allQuestions.filter(q => q.type === 'خطأ') : [];
                    
                    const comprehensionQuestions = typePercentages.comprehension > 0 ? 
                        allQuestions.filter(q => q.type === 'استيعاب') : [];
                    
                    const analogyQuestions = typePercentages.analogy > 0 ? 
                        allQuestions.filter(q => q.type === 'تناظر') : [];
                    
                    const completionQuestions = typePercentages.completion > 0 ? 
                        allQuestions.filter(q => q.type === 'اكمال') : [];
                    
                    const vocabularyQuestions = typePercentages.vocabulary > 0 ? 
                        allQuestions.filter(q => q.type === 'مفردة') : [];
                    
                    // Combine all filtered questions
                    const filteredQuestions = [
                        ...errorQuestions,
                        ...comprehensionQuestions,
                        ...analogyQuestions,
                        ...completionQuestions,
                        ...vocabularyQuestions
                    ];
                    
                    // If we have filtered questions, use them
                    if (filteredQuestions.length > 0) {
                        allQuestions = filteredQuestions;
                    }
                }
                
                // Shuffle the questions
                this.shuffleArray(allQuestions);
                
                // Step 4: Prepare quiz data
                if (this.freeRunnerMode) {
                    // In free runner mode, include ALL questions that meet the conditions
                    this.quizData = [...allQuestions];
                    this.allQuestions = []; // Clear since we've used all questions
                } else {
                    // In normal mode, limit by question count
                    this.quizData = allQuestions.slice(0, this.questionCount);
                    // Save remaining questions for later
                    this.allQuestions = allQuestions.slice(this.questionCount);
                }
                
                // Final shuffle of selected questions
                this.shuffleArray(this.quizData);
                
                // خلط خيارات كل سؤال مع الحفاظ على الإجابة الصحيحة
                this.shuffleAllOptions();
            },
            
            // إضافة دالة لخلط خيارات جميع الأسئلة
            shuffleAllOptions() {
                this.quizData.forEach(question => {
                    // حفظ الإجابة الصحيحة قبل الخلط
                    const correctOption = question.options[question.correctIndex];
                    
                    // خلط الخيارات
                    this.shuffleArray(question.options);
                    
                    // تحديث مؤشر الإجابة الصحيحة بعد الخلط
                    question.correctIndex = question.options.indexOf(correctOption);
                });
            },
            
            calculateMastery(stats) {
                if (!stats) return 0;

                const attempts = stats.attempts || 0;
                const correct = stats.correct || 0;
                const incorrect = attempts - correct;

                if (attempts === 0) return 0;

                // Base requirement: 4 correct answers for a question with no errors
                const baseRequirement = 4;
                
                // Calculate required correct answers based on number of incorrect answers
                // For each incorrect answer, we add 3 more required correct answers
                const requiredCorrect = baseRequirement + (incorrect * 3);
                
                // If we haven't reached the minimum required correct answers
                if (correct < requiredCorrect) {
                    return Math.round((correct / requiredCorrect) * 100);
                }
                
                // If no incorrect answers and we've met the base requirement
                if (incorrect === 0 && correct >= baseRequirement) {
                    return 100;
                }
                
                let mastery = Math.min(100, Math.round((correct / requiredCorrect) * 100));

                return mastery;
            },

            shuffleArray(array) {
                for (let i = array.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [array[i], array[j]] = [array[j], array[i]];
                }
            },

            renderQuestion() {
                const container = document.getElementById('questionsContainer');
                container.innerHTML = '';
                
                // Start timing for this question
                this.questionStartTime = Date.now();
                
                const question = this.quizData[this.currentQuestion];
                const questionDiv = document.createElement('div');
                questionDiv.className = 'question-card';
                
                const options = [...question.options];
                const correctIndex = question.correctIndex;
                const isMarked = this.markedQuestions.has(this.currentQuestion);
                const hasAnswered = this.userAnswers[this.currentQuestion] !== -1;
                
                const isErrorTypeQuestion = 
                    question.type === 'خطأ' || 
                    question.question.includes('خطأ:') || 
                    question.question.includes('الخطأ:') ||
                    options.some(opt => opt.includes('*'));
                    
                let highlightedQuestion = question.question;
                
                if (isErrorTypeQuestion) {
                    highlightedQuestion = this.highlightOptionsInQuestion(question.question, options);
                }
                
                const isComprehensionQuestion = 
                    question.type === 'استيعاب' && 
                    question.Passage && 
                    question.Passage.length > 0;
                
                questionDiv.innerHTML = `
                    <button class="mark-btn ${isMarked ? 'marked' : ''}" id="markBtn">
                        <svg viewBox="0 0 24 24">
                            <path d="M12,17.27L18.18,21L16.54,13.97L22,9.24L14.81,8.62L12,2L9.19,8.62L2,9.24L7.45,13.97L5.82,21L12,17.27Z"/>
                        </svg>
                    </button>
                    <button class="mastery-shortcut-btn" id="masteryShortcutBtn" title="اختصار الإتقان">
                        <svg viewBox="0 0 24 24">
                            <path d="M9,16.17L4.83,12l-1.42,1.41L9,19 21,7l-1.41-1.41L9,16.17z"/>
                        </svg>
                    </button>
                    <button class="delete-mastery-btn" id="deleteMasteryBtn" title="حذف الإتقان">
                        <svg viewBox="0 0 24 24">
                            <path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"/>
                        </svg>
                    </button>
                    <div class="mastery-indicator ${isMarked ? 'marked' : ''}">
                        ${isMarked ? 'سؤال معلّم' : `الإتقان: ${question.masteryPercent}%`}
                    </div>
                    <div class="question-timer" id="questionTimer">0</div>
                    ${isComprehensionQuestion ? this.createPassagePreview(question.Passage) : ''}
                    <h2>${highlightedQuestion}</h2>
                    <div class="options-grid"></div>
                `;

                options.forEach((option, index) => {
                    const optionDiv = document.createElement('div');
                    optionDiv.className = 'option';
                    
                    const cleanOption = option.replace('*', '');
                    optionDiv.textContent = cleanOption;
                    
                    if (hasAnswered) {
                        if (index === correctIndex) {
                            optionDiv.classList.add('correct');
                        } else if (index === this.userAnswers[this.currentQuestion]) {
                            optionDiv.classList.add('wrong');
                            optionDiv.innerHTML = this.highlightIncorrectWords(cleanOption);
                        }
                        optionDiv.style.pointerEvents = 'none';
                    } else {
                        optionDiv.onclick = () => this.handleAnswer(index, index === correctIndex);
                    }
                    
                    questionDiv.querySelector('.options-grid').appendChild(optionDiv);
                });

                const markBtn = questionDiv.querySelector('#markBtn');
                markBtn.onclick = (e) => {
                    e.stopPropagation();
                    this.toggleMarkQuestion();
                };
                
                const masteryShortcutBtn = questionDiv.querySelector('#masteryShortcutBtn');
                masteryShortcutBtn.onclick = (e) => {
                    e.stopPropagation();
                    this.setQuestionMastery();
                };
                
                const deleteMasteryBtn = questionDiv.querySelector('#deleteMasteryBtn');
                deleteMasteryBtn.onclick = (e) => {
                    e.stopPropagation();
                    this.deleteQuestionMastery();
                };

                container.appendChild(questionDiv);
                
                if (isComprehensionQuestion) {
                    this.setupPassageModal(question.Passage);
                }
                
                this.updateNavigationButtons();
                this.updateStatsWidget();

                // Start the question timer
                this.startQuestionTimer();
            },
            
            highlightOptionsInQuestion(questionText, options) {
                let highlightedText = questionText;
                
                const cleanOptions = options.map(opt => opt.replace('*', '').trim());
                
                cleanOptions.sort((a, b) => b.length - a.length);
                
                const commonWords = [
                    'من', 'في', 'إلى', 'على', 'عن', 'مع', 'هذا', 'هذه', 'ذلك', 'تلك',
                    'الذي', 'التي', 'الذين', 'اللاتي', 'أن', 'لا', 'لم', 'لن', 'كان',
                    'كانت', 'يكون', 'تكون', 'هو', 'هي', 'هم', 'هن', 'نحن', 'أنا',
                    'أنت', 'أنتم', 'أنتن', 'هناك', 'هنا', 'حتى', 'إذا', 'إن', 'ثم',
                    'لكن', 'لأن', 'بأن', 'كل', 'بعض', 'غير', 'عند', 'عندما', 'أو',
                    'بين', 'قد', 'و', 'ف', 'ب', 'ل', 'ك', 'قبل', 'بعد', 'فوق', 'تحت'
                ];
                
                for (const option of cleanOptions) {
                    if (option && option.length > 1) {
                        if (option.length <= 2) continue;
                        
                        const optionWords = option.split(/\s+/);
                        
                        for (const word of optionWords) {
                            if (word.length >= 3 && !commonWords.includes(word)) {
                                const regex = new RegExp(`\\b${this.escapeRegExp(word)}\\b`, 'g');
                                
                                highlightedText = highlightedText.replace(regex, match => 
                                    `<span class="highlighted-word">${match}</span>`
                                );
                            }
                        }
                    }
                }
                
                return highlightedText;
            },
            
            escapeRegExp(string) {
                return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            },

            updateLayout() {
                const optionsGrid = document.querySelector('.options-grid');
                if (!optionsGrid) return;
                
                if (window.matchMedia("(orientation: portrait)").matches) {
                    optionsGrid.style.display = 'flex';
                    optionsGrid.style.flexDirection = 'column';
                } else {
                    optionsGrid.style.display = 'grid';
                    optionsGrid.style.gridTemplateColumns = 'repeat(2, 1fr)';
                }
            },

            toggleMarkQuestion() {
                const isMarked = this.markedQuestions.has(this.currentQuestion);
                const question = this.quizData[this.currentQuestion];
                
                if (isMarked) {
                    this.markedQuestions.delete(this.currentQuestion);
                    question.stats.marked = false;
                } else {
                    this.markedQuestions.add(this.currentQuestion);
                    question.stats.marked = true;
                }
                
                const questionId = question.id;
                
                db.collection('questions').doc(questionId).update({
                    'stats.marked': !isMarked
                }).catch(error => console.error('Error updating marked status:', error));
                
                const markBtn = document.querySelector('#markBtn');
                const masteryIndicator = document.querySelector('.mastery-indicator');
                
                if (markBtn) {
                    markBtn.classList.toggle('marked', !isMarked);
                }
                
                if (masteryIndicator) {
                    masteryIndicator.classList.toggle('marked', !isMarked);
                    masteryIndicator.textContent = !isMarked ? 'سؤال معلّم' : `الإتقان: ${question.masteryPercent}%`;
                }
            },
            
            setQuestionMastery() {
                const question = this.quizData[this.currentQuestion];
                const questionId = question.id;
                
                // Show a brief animation on the button to indicate it's working
                const masteryBtn = document.querySelector('#masteryShortcutBtn');
                masteryBtn.classList.add('active');
                
                // Set Firebase values for mastery (incorrect: 0, correct: 5)
                db.collection('questions').doc(questionId).update({
                    'stats.attempts': 5,
                    'stats.correct': 5
                }).then(() => {
                    // Update local data
                    question.stats.attempts = 5;
                    question.stats.correct = 5;
                    question.masteryPercent = 100;
                    
                    // Update UI
                    const masteryIndicator = document.querySelector('.mastery-indicator');
                    if (masteryIndicator && !masteryIndicator.classList.contains('marked')) {
                        masteryIndicator.textContent = `الإتقان: 100%`;
                    }
                    
                    // Update mastery distribution chart
                    this.updateMasteryDistributionChart();
                    
                    // Show success feedback
                    this.showCustomAlert({
                        icon: '✓',
                        title: 'تم تعيين الإتقان',
                        content: 'تم تعيين هذا السؤال كمتقن بنجاح',
                        confirmText: 'حسناً',
                        showCancel: false
                    });
                    
                    // Remove animation
                    setTimeout(() => {
                        masteryBtn.classList.remove('active');
                    }, 500);
                }).catch(error => {
                    console.error('Error updating mastery status:', error);
                    masteryBtn.classList.remove('active');
                    
                    this.showCustomAlert({
                        icon: '❌',
                        title: 'خطأ',
                        content: 'حدث خطأ أثناء تعيين الإتقان',
                        confirmText: 'حسناً',
                        showCancel: false
                    });
                });
            },
            
            deleteQuestionMastery() {
                const question = this.quizData[this.currentQuestion];
                const questionId = question.id;
                
                // Show a brief animation on the button to indicate it's working
                const deleteBtn = document.querySelector('#deleteMasteryBtn');
                deleteBtn.classList.add('active');
                
                // Set Firebase values to reset mastery (attempts: 0, correct: 0)
                db.collection('questions').doc(questionId).update({
                    'stats.attempts': 0,
                    'stats.correct': 0
                }).then(() => {
                    // Update local data
                    question.stats.attempts = 0;
                    question.stats.correct = 0;
                    question.masteryPercent = 0;
                    
                    // Update UI
                    const masteryIndicator = document.querySelector('.mastery-indicator');
                    if (masteryIndicator && !masteryIndicator.classList.contains('marked')) {
                        masteryIndicator.textContent = `الإتقان: 0%`;
                    }
                    
                    // Update mastery distribution chart
                    this.updateMasteryDistributionChart();
                    
                    // Show success feedback
                    this.showCustomAlert({
                        icon: '✓',
                        title: 'تم حذف الإتقان',
                        content: 'تم حذف إتقان هذا السؤال بنجاح',
                        confirmText: 'حسناً',
                        showCancel: false
                    });
                    
                    // Remove animation
                    setTimeout(() => {
                        deleteBtn.classList.remove('active');
                    }, 500);
                }).catch(error => {
                    console.error('Error deleting mastery status:', error);
                    deleteBtn.classList.remove('active');
                    
                    this.showCustomAlert({
                        icon: '❌',
                        title: 'خطأ',
                        content: 'حدث خطأ أثناء حذف الإتقان',
                        confirmText: 'حسناً',
                        showCancel: false
                    });
                });
            },

            handleAnswer(index, isCorrect) {
                const options = document.querySelectorAll('.option');
                options.forEach(opt => opt.style.pointerEvents = 'none');
                
                // Stop the question timer when answering
                if (this.questionTimerInterval) {
                    clearInterval(this.questionTimerInterval);
                }
                
                // Calculate time spent on this question and add to time bar
                if (this.questionStartTime) {
                    const timeSpent = Math.round((Date.now() - this.questionStartTime) / 1000);
                    this.timePerQuestion[this.currentQuestion] = timeSpent;
                    this.addTimeToBar(timeSpent);
                    console.log(`Time spent on question ${this.currentQuestion + 1}: ${timeSpent} seconds`);
                } else {
                    console.warn('Question start time not set');
                    this.timePerQuestion[this.currentQuestion] = 0;
                }
                
                // Update streak counter
                if (isCorrect) {
                    this.currentStreak++;
                    
                    // Update highest streak if current streak is higher
                    if (this.currentStreak > this.highestStreak) {
                        this.highestStreak = this.currentStreak;
                        console.log('New highest streak:', this.highestStreak);
                    }
                    
                    const streakCounter = document.getElementById('streakCounter');
                    const streakCount = document.getElementById('streakCount');
                    
                    if (streakCount) streakCount.textContent = this.currentStreak;
                    if (streakCounter) {
                        streakCounter.style.display = 'flex';
                        
                        // Make sure the streak counter is visible (not hidden by CSS)
                        streakCounter.style.visibility = 'visible';
                        streakCounter.style.opacity = '1';
                        
                        // Add milestone animation for every 5 streak
                        if (this.currentStreak % 5 === 0) {
                            streakCounter.classList.add('milestone');
                            setTimeout(() => {
                                streakCounter.classList.remove('milestone');
                            }, 1000);
                        }
                        
                        // Log to console for debugging
                        console.log('Streak updated:', this.currentStreak);
                    } else {
                        console.warn('Streak counter element not found');
                    }
                } else {
                    this.currentStreak = 0;
                    const streakCount = document.getElementById('streakCount');
                    const streakCounter = document.getElementById('streakCounter');
                    
                    if (streakCount) streakCount.textContent = this.currentStreak;
                    if (streakCounter) streakCounter.style.display = 'none';
                    
                    // Log to console for debugging
                    console.log('Streak reset to 0');
                }

                this.userAnswers[this.currentQuestion] = index;
                this.updateProgress();

                const stealthMode = document.getElementById('stealthMode').checked;

                options.forEach((opt, idx) => {
                    if (idx === this.quizData[this.currentQuestion].correctIndex) {
                        opt.classList.add('correct');
                    } else if (idx === this.userAnswers[this.currentQuestion]) {
                        opt.classList.add('wrong');
                        opt.innerHTML = this.highlightIncorrectWords(opt.textContent);
                    }
                    opt.style.pointerEvents = 'none';
                });

                const questionId = this.quizData[this.currentQuestion].id;

                db.collection('questions').doc(questionId).update({
                    'stats.attempts': firebase.firestore.FieldValue.increment(1),
                    'stats.correct': firebase.firestore.FieldValue.increment(isCorrect ? 1 : 0)
                }).then(() => {
                    // Update mastery distribution chart after updating stats
                    this.updateMasteryDistributionChart();
                }).catch(error => console.error('Error updating question stats:', error));

                const question = this.quizData[this.currentQuestion];
                question.stats.attempts = (question.stats.attempts || 0) + 1;
                if (isCorrect) {
                    question.stats.correct = (question.stats.correct || 0) + 1;
                }

                question.masteryPercent = this.calculateMastery(question.stats);

                this.updateStatsWidget();

                if (this.autoAdvance && isCorrect) {
                    setTimeout(() => {
                        if (this.currentQuestion < this.quizData.length - 1) {
                            this.nextQuestion();
                        } else {
                            this.showResults();
                        }
                    }, 500);
                }
            },
            
            highlightIncorrectWords(text) {
                const words = text.split(' ');
                
                const highlightedText = words.map(word => 
                    `<span class="highlighted-error">${word}</span>`
                ).join(' ');
                
                return highlightedText;
            },

            updateProgress() {
                const answered = this.userAnswers.filter(ans => ans !== -1).length;
                const total = this.quizData.length;
                const remaining = total - answered;
                let percentage = Math.round((answered / total) * 100);

                if (this.freeRunnerMode) {
                    percentage = Math.min(100, Math.round((answered / (this.currentQuestion + 1)) * 100));
                }

                document.getElementById('progressBarFill').style.width = `${percentage}%`;
                
                if (this.freeRunnerMode) {
                    document.getElementById('progressText').textContent = 
                        `الأسئلة المحلولة: ${answered} | السؤال الحالي: ${this.currentQuestion + 1} | إجمالي الأسئلة المستوفية للشروط: ${total}`;
                    
                    // Add a free runner info element if it doesn't exist
                    if (!document.querySelector('.free-runner-info')) {
                        const infoElement = document.createElement('div');
                        infoElement.className = 'free-runner-info';
                        infoElement.textContent = 'الوضع الحر: تم تحميل جميع الأسئلة المستوفية للشروط';
                        document.querySelector('.progress-bar').after(infoElement);
                    }
                } else {
                    document.getElementById('progressText').textContent = 
                        `الأسئلة المحلولة: ${answered}/${total} | المتبقية: ${remaining} | النسبة: ${percentage}%`;
                    
                    // Remove free runner info if it exists
                    const infoElement = document.querySelector('.free-runner-info');
                    if (infoElement) infoElement.remove();
                }
            },

            updateStatsWidget() {
                const correctAnswers = this.userAnswers.filter((ans, index) => 
                    ans !== -1 && ans === this.quizData[index].correctIndex
                ).length;
                
                const wrongAnswers = this.userAnswers.filter((ans, index) => 
                    ans !== -1 && ans !== this.quizData[index].correctIndex
                ).length;
                
                const unanswered = this.userAnswers.filter(ans => ans === -1).length;
                
                document.getElementById('widgetCorrect').textContent = correctAnswers;
                document.getElementById('widgetWrong').textContent = wrongAnswers;
                document.getElementById('widgetUnanswered').textContent = unanswered;
            },

            startTotalTimer() {
                this.totalTimer = setInterval(() => {
                    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
                    const remaining = Math.max(0, this.totalTime - elapsed);
                    
                    if (remaining <= 0) {
                        clearInterval(this.totalTimer);
                        this.showResults();
                        return;
                    }
                    
                    const minutes = Math.floor(remaining / 60).toString().padStart(2, '0');
                    const seconds = (remaining % 60).toString().padStart(2, '0');
                    document.getElementById('totalTimer').textContent = `الوقت المتبقي: ${minutes}:${seconds}`;
                    
                    // Update remaining time per question
                    this.updateRemainingTimePerQuestion();
                }, 1000);
            },

            updateNavigationButtons() {
                const prevBtn = document.getElementById('prevBtn');
                const nextBtn = document.getElementById('nextBtn');
                
                prevBtn.disabled = this.currentQuestion === 0;
                
                if (this.freeRunnerMode) {
                    nextBtn.textContent = 'التالي';
                } else {
                    nextBtn.textContent = this.currentQuestion === this.quizData.length - 1 ? 'إنهاء' : 'التالي';
                }
            },

            nextQuestion() {
                // Clear the question timer when moving to next question
                if (this.questionTimerInterval) {
                    clearInterval(this.questionTimerInterval);
                }
                
                if (this.freeRunnerMode) {
                    if (this.currentQuestion >= this.quizData.length - 1) {
                        this.addMoreQuestions();
                    }
                    this.currentQuestion++;
                    this.renderQuestion();
                    this.updateProgress();
                } else {
                    if (this.currentQuestion < this.quizData.length - 1) {
                        this.currentQuestion++;
                        this.renderQuestion();
                        this.updateProgress();
                    } else {
                        this.showResults();
                    }
                }
            },
            
            addMoreQuestions() {
                if (this.allQuestions.length > 0) {
                    // Add next batch of questions (150 at a time)
                    const batchSize = Math.min(150, this.allQuestions.length);
                    const additionalQuestions = this.allQuestions.splice(0, batchSize);
                    
                    this.quizData = [...this.quizData, ...additionalQuestions];
                    
                    this.userAnswers = [
                        ...this.userAnswers, 
                        ...new Array(additionalQuestions.length).fill(-1)
                    ];
                } else if (this.freeRunnerMode) {
                    // In free runner mode, if all questions are already loaded, show a notification
                    this.showCustomAlert({
                        icon: 'ℹ️',
                        title: 'تنبيه',
                        content: 'تم تحميل جميع الأسئلة المستوفية للشروط بالفعل.',
                        confirmText: 'حسناً',
                        showCancel: false
                    });
                }
            },
            
            previousQuestion() {
                // Clear the question timer when moving to previous question
                if (this.questionTimerInterval) {
                    clearInterval(this.questionTimerInterval);
                }
                
                if (this.currentQuestion > 0) {
                    this.currentQuestion--;
                    this.renderQuestion();
                    this.updateProgress();
                }
            },

            showResults() {
                // Clear the time bar
                const timeBar = document.getElementById('timeBar');
                if (timeBar) {
                    timeBar.innerHTML = '';
                }
                
                // Hide remaining time per question
                const remainingTimeElement = document.getElementById('remainingTimePerQuestion');
                if (remainingTimeElement) {
                    remainingTimeElement.style.display = 'none';
                }
                
                clearInterval(this.totalTimer);
                document.getElementById('statsWidget').style.display = 'none';
                
                const correctAnswers = this.userAnswers.filter((ans, index) => 
                    ans !== -1 && ans === this.quizData[index].correctIndex
                ).length;
                
                const wrongAnswers = this.userAnswers.filter((ans, index) => 
                    ans !== -1 && ans !== this.quizData[index].correctIndex
                ).length;
                
                const unanswered = this.userAnswers.filter(ans => ans === -1).length;
                const totalQuestions = this.quizData.length;

                const finalScore = Math.round((correctAnswers / totalQuestions) * 100);

                document.getElementById('correctCount').textContent = `${correctAnswers} صحيحة`;
                document.getElementById('wrongCount').textContent = `${wrongAnswers} خاطئة`;
                document.getElementById('unansweredCount').textContent = `${unanswered} غير مجابة`;
                document.getElementById('finalScore').textContent = `النسبة النهائية: ${finalScore}%`;
                
                // Calculate time statistics
                let totalTimeSpent = 0;
                let answeredQuestionsCount = 0;
                let fastestAnswer = Infinity;
                let slowestAnswer = 0;
                
                this.timePerQuestion.forEach(time => {
                    if (time !== undefined && time > 0) {
                        totalTimeSpent += time;
                        answeredQuestionsCount++;
                        
                        // Track fastest and slowest answers
                        if (time < fastestAnswer) {
                            fastestAnswer = time;
                        }
                        if (time > slowestAnswer) {
                            slowestAnswer = time;
                        }
                    }
                });
                
                const averageTimePerQuestion = answeredQuestionsCount > 0 ? 
                    Math.round(totalTimeSpent / answeredQuestionsCount) : 0;
                
                // If no answers were recorded, set fastest to 0
                if (fastestAnswer === Infinity) {
                    fastestAnswer = 0;
                }
                
                // Calculate speed rate: Total time / (Correct answers - 4 * Wrong answers)
                const speedRateDenominator = correctAnswers - (4 * wrongAnswers);
                let speedRate = 0;
                
                if (speedRateDenominator > 0) {
                    speedRate = Math.round(totalTimeSpent / speedRateDenominator);
                } else {
                    // If denominator is zero or negative, display a special value
                    speedRate = '∞';
                }
                
                // Format time function to convert seconds to minutes and seconds
                const formatTime = (seconds) => {
                    if (seconds < 60) {
                        return `${seconds} ثانية`;
                    } else {
                        const minutes = Math.floor(seconds / 60);
                        const remainingSeconds = seconds % 60;
                        if (remainingSeconds === 0) {
                            return `${minutes} دقيقة`;
                        } else {
                            return `${minutes} دقيقة و ${remainingSeconds} ثانية`;
                        }
                    }
                };
                
                // Update time statistics in the UI
                document.getElementById('averageTimePerQuestion').textContent = formatTime(averageTimePerQuestion);
                document.getElementById('totalTimeSpent').textContent = formatTime(totalTimeSpent);
                document.getElementById('fastestAnswer').textContent = formatTime(fastestAnswer);
                document.getElementById('slowestAnswer').textContent = formatTime(slowestAnswer);
                document.getElementById('speedRate').textContent = typeof speedRate === 'number' ? formatTime(speedRate) : speedRate;
                document.getElementById('highestStreak').textContent = this.highestStreak || 0;
                
                this.createUnifiedChart(correctAnswers, wrongAnswers, unanswered);
                
                const wrongContainer = document.getElementById('wrongQuestionsDetails');
                wrongContainer.innerHTML = '';
                
                this.userAnswers.forEach((userAnswer, index) => {
                    const question = this.quizData[index];
                    
                    // Skip if question is undefined
                    if (!question) {
                        console.warn(`Question at index ${index} is undefined`);
                        return;
                    }
                    
                    const isCorrect = userAnswer !== -1 && userAnswer === question.correctIndex;
                    const isUnanswered = userAnswer === -1;
                    
                    if (!isCorrect || isUnanswered) {
                        const status = isUnanswered ? 'unanswered' : 'wrong';
                        const cardDiv = this.createQuestionDetails(question, index, status);
                        wrongContainer.appendChild(cardDiv);
                    }
                });

                this.switchPage('results-page');
            },

            createUnifiedChart(correct, wrong, unanswered) {
                const chartContainer = document.getElementById('resultsChart');
                
                if (this.resultsChart) {
                    this.resultsChart.destroy();
                }
                
                chartContainer.innerHTML = '<canvas></canvas>';
                const ctx = chartContainer.querySelector('canvas').getContext('2d');
                
                this.resultsChart = new Chart(ctx, {
                    type: 'doughnut',
                    data: {
                        labels: ['صحيحة', 'خاطئة', 'غير مجابة'],
                        datasets: [{
                            data: [correct, wrong, unanswered],
                            backgroundColor: [
                                getComputedStyle(document.documentElement).getPropertyValue('--correct'),
                                getComputedStyle(document.documentElement).getPropertyValue('--wrong'),
                                getComputedStyle(document.documentElement).getPropertyValue('--unanswered')
                            ],
                            borderWidth: 0
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: true,
                        cutout: '70%',
                        plugins: {
                            legend: {
                                display: false
                            },
                            tooltip: {
                                enabled: true,
                                callbacks: {
                                    label: function(context) {
                                        const label = context.label || '';
                                        const value = context.formattedValue || '';
                                        const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                        const percentage = Math.round((context.raw / total) * 100);
                                        return `${label}: ${value} (${percentage}%)`;
                                    }
                                }
                            }
                        }
                    }
                });
            },

            createQuestionDetails(question, index, status) {
                const isUnanswered = status === 'unanswered';
                const userAnswer = this.userAnswers[index];
                const isWrong = !isUnanswered && userAnswer !== question.correctIndex;

                const cardDiv = document.createElement('div');
                cardDiv.className = `question-detail ${status}`;
                
                // Create header with question number, status, and time spent
                const header = document.createElement('div');
                header.className = 'question-detail-header';
                
                const questionNumber = document.createElement('span');
                questionNumber.className = 'question-number';
                questionNumber.textContent = `سؤال ${index + 1}`;
                
                const statusIndicator = document.createElement('span');
                statusIndicator.className = 'status-indicator';
                statusIndicator.textContent = status === 'correct' ? 'صحيح' : status === 'wrong' ? 'خطأ' : 'غير مجاب';
                
                // Add time spent indicator
                const timeSpentEl = document.createElement('span');
                timeSpentEl.className = 'time-spent';
                if (this.timePerQuestion[index] !== undefined) {
                    // Format time in minutes and seconds
                    const seconds = this.timePerQuestion[index];
                    if (seconds < 60) {
                        timeSpentEl.textContent = `${seconds} ثانية`;
                    } else {
                        const minutes = Math.floor(seconds / 60);
                        const remainingSeconds = seconds % 60;
                        if (remainingSeconds === 0) {
                            timeSpentEl.textContent = `${minutes} دقيقة`;
                        } else {
                            timeSpentEl.textContent = `${minutes} دقيقة و ${remainingSeconds} ثانية`;
                        }
                    }
                } else {
                    timeSpentEl.textContent = 'غير محدد';
                }
                
                header.appendChild(questionNumber);
                header.appendChild(timeSpentEl);
                header.appendChild(statusIndicator);
                cardDiv.appendChild(header);

                let userAnswerHtml = '';
                if (!isUnanswered && question.options && userAnswer !== undefined && question.options[userAnswer]) {
                    const answerText = question.options[userAnswer].replace('*', '');
                    if (isWrong) {
                        userAnswerHtml = this.highlightIncorrectWords(answerText);
                    } else {
                        userAnswerHtml = answerText;
                    }
                } else if (!isUnanswered) {
                    userAnswerHtml = 'غير متوفر';
                }
                
                const answerDetails = `
                    <div class="question-header">
                        <h4>
                            ${question.question}
                            <span class="status-indicator"></span>
                        </h4>
                    </div>
                    <div class="answer-section">
                        <div class="${isUnanswered ? 'unanswered-answer' : 'user-answer'}">
                            <strong>إجابتك:</strong>
                            <p>${userAnswerHtml}</p>
                        </div>
                        <div class="correct-answer">
                            <strong>الإجابة الصحيحة:</strong>
                            <p>${question.options && question.correctIndex !== undefined && question.options[question.correctIndex] ? question.options[question.correctIndex].replace('*', '') : 'غير متوفر'}</p>
                        </div>
                    </div>
                `;

                cardDiv.innerHTML = answerDetails;

                const copyBtn = document.createElement('button');
                copyBtn.className = 'copy-btn';
                copyBtn.textContent = 'نسخ السؤال';
                
                const questionText = `${question.question}\n${question.options.map((opt, i) => 
                    `${i === question.correctIndex ? '*' : ''}${opt.replace('*', '')}`).join('\n')}`;
                    
                copyBtn.onclick = () => navigator.clipboard.writeText(questionText);

                const questionHeader = cardDiv.querySelector('.question-header');
                questionHeader.insertBefore(copyBtn, questionHeader.querySelector('h4'));
                
                return cardDiv;
            },
            
            showPassageModal(passage) {
                let modal = document.getElementById('globalPassageModal');
                if (!modal) {
                    modal = document.createElement('div');
                    modal.id = 'globalPassageModal';
                    modal.className = 'passage-modal';
                    modal.innerHTML = `
                        <div class="passage-modal-content">
                            <button class="passage-modal-close">&times;</button>
                            <div class="passage-modal-text"></div>
                        </div>
                    `;
                    document.body.appendChild(modal);
                    
                    const closeBtn = modal.querySelector('.passage-modal-close');
                    closeBtn.addEventListener('click', () => {
                        modal.classList.remove('active');
                        document.body.style.overflow = '';
                    });
                    
                    modal.addEventListener('click', (e) => {
                        if (e.target === modal) {
                            modal.classList.remove('active');
                            document.body.style.overflow = '';
                        }
                    });
                }
                
                modal.querySelector('.passage-modal-text').textContent = passage;
                modal.classList.add('active');
                document.body.style.overflow = 'hidden';
            },

            createPassagePreview(passage) {
                const previewText = passage.length > 150 ? passage.substring(0, 150) + '...' : passage;
                return `
                    <div class="passage-preview" id="passagePreview">
                        <div class="passage-preview-content">${previewText}</div>
                    </div>
                    <div class="passage-modal" id="passageModal">
                        <div class="passage-modal-content">
                            <button class="passage-modal-close">&times;</button>
                            <div class="passage-modal-text">${passage}</div>
                        </div>
                    </div>
                `;
            },
            
            setupPassageModal(passage) {
                // First check if passage exists and is not empty
                if (!passage || passage.trim() === '') {
                    console.log('No passage content to display');
                    return;
                }
                
                // Use direct DOM access instead of setTimeout
                const preview = document.getElementById('passagePreview');
                const modal = document.getElementById('passageModal');
                
                // Check if elements exist before proceeding
                if (!preview || !modal) {
                    // Use the showPassageModal function as a fallback
                    console.log('Using global passage modal as fallback');
                    this.showPassageModal(passage);
                    return;
                }
                
                const closeBtn = modal.querySelector('.passage-modal-close');
                
                // Function to open the modal
                const openModal = () => {
                    modal.classList.add('active');
                    document.body.style.overflow = 'hidden'; // Prevent scrolling behind modal
                };
                
                // Function to close the modal
                const closeModal = () => {
                    modal.classList.remove('active');
                    document.body.style.overflow = '';
                };
                
                // Add click event directly to the preview element
                preview.onclick = openModal;
                
                if (closeBtn) {
                    closeBtn.onclick = closeModal;
                }
                
                // Close when clicking outside the content
                modal.onclick = (e) => {
                    if (e.target === modal) {
                        closeModal();
                    }
                };
                
                // Close on escape key
                document.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape' && modal.classList.contains('active')) {
                        closeModal();
                    }
                });
            },

            copyAllMarked() {
                if (this.markedQuestions.size === 0) {
                    alert('لا توجد أسئلة معلّمة للنسخ');
                    return;
                }
                
                const markedQuestionTexts = Array.from(this.markedQuestions)
                    .map(index => {
                        const q = this.quizData[index];
                        return `${q.question}\n${q.options.map((opt, i) => 
                            `${i === q.correctIndex ? '*' : ''}${opt.replace('*', '')}`).join('\n')}`;
                    })
                    .join('\n\n==\n\n');
                
                navigator.clipboard.writeText(markedQuestionTexts);
                alert('تم نسخ الأسئلة المعلّمة بنجاح');
            },

            switchPage(pageId) {
                document.querySelectorAll('.page').forEach(p => p.classList.remove('active-page'));
                document.querySelector(`.${pageId}`).classList.add('active-page');
            },

            restartQuiz() {
                window.location.reload();
            },

            getQuestionTypePercentages() {
                // Create an object to store the percentages
                const percentages = {
                    error: 0,
                    comprehension: 0,
                    analogy: 0,
                    completion: 0, 
                    vocabulary: 0
                };
                
                // Get all existing sliders
                const errorSlider = document.getElementById('errorTypeSlider');
                const comprehensionSlider = document.getElementById('comprehensionTypeSlider');
                const analogySlider = document.getElementById('analogyTypeSlider');
                const completionSlider = document.getElementById('completionTypeSlider');
                const vocabularySlider = document.getElementById('vocabularyTypeSlider');
                
                // Count how many sliders actually exist
                let sliderCount = 0;
                let totalValue = 0;
                
                // Only add values from sliders that exist in the DOM
                if (errorSlider) {
                    percentages.error = parseInt(errorSlider.value) || 0;
                    totalValue += percentages.error;
                    sliderCount++;
                }
                
                if (comprehensionSlider) {
                    percentages.comprehension = parseInt(comprehensionSlider.value) || 0;
                    totalValue += percentages.comprehension;
                    sliderCount++;
                }
                
                if (analogySlider) {
                    percentages.analogy = parseInt(analogySlider.value) || 0;
                    totalValue += percentages.analogy;
                    sliderCount++;
                }
                
                if (completionSlider) {
                    percentages.completion = parseInt(completionSlider.value) || 0;
                    totalValue += percentages.completion;
                    sliderCount++;
                }
                
                if (vocabularySlider) {
                    percentages.vocabulary = parseInt(vocabularySlider.value) || 0;
                    totalValue += percentages.vocabulary;
                    sliderCount++;
                }
                
                // If no sliders exist or total is 0, distribute evenly among existing types
                if (sliderCount === 0 || totalValue === 0) {
                    const evenShare = Math.floor(100 / sliderCount);
                    
                    if (errorSlider) percentages.error = evenShare;
                    if (comprehensionSlider) percentages.comprehension = evenShare;
                    if (analogySlider) percentages.analogy = evenShare;
                    if (completionSlider) percentages.completion = evenShare;
                    if (vocabularySlider) percentages.vocabulary = evenShare;
                }
                
                return percentages;
            },
            
            filterQuestionsByTypeDistribution(questions, typePercentages) {
                // Only include question types that have percentages > 0
                const activeTypes = [];
                
                if (typePercentages.error > 0) activeTypes.push('error');
                if (typePercentages.comprehension > 0) activeTypes.push('comprehension');
                if (typePercentages.analogy > 0) activeTypes.push('analogy');
                if (typePercentages.completion > 0) activeTypes.push('completion');
                if (typePercentages.vocabulary > 0) activeTypes.push('vocabulary');
                
                // If no types are active, return all questions
                if (activeTypes.length === 0) {
                    this.shuffleArray(questions);
                    // In free runner mode, return all questions without limiting by questionCount
                    if (this.freeRunnerMode) {
                        return questions;
                    } else {
                        return questions.slice(0, this.questionCount);
                    }
                }
                
                // Normalize percentages among active types to ensure they sum to 100%
                const totalActivePercentage = activeTypes.reduce((sum, type) => sum + typePercentages[type], 0);
                const normalizedPercentages = {};
                
                activeTypes.forEach(type => {
                    normalizedPercentages[type] = (typePercentages[type] / totalActivePercentage) * 100;
                });
                
                // Filter questions by active types
                const errorQuestions = activeTypes.includes('error') ? questions.filter(q => 
                    q.type === 'خطأ'
                ) : [];
                
                const comprehensionQuestions = activeTypes.includes('comprehension') ? questions.filter(q => 
                    q.type === 'استيعاب'
                ) : [];
                
                const analogyQuestions = activeTypes.includes('analogy') ? questions.filter(q => 
                    q.type === 'تناظر'
                ) : [];
                
                const completionQuestions = activeTypes.includes('completion') ? questions.filter(q => 
                    q.type === 'اكمال'
                ) : [];
                
                const vocabularyQuestions = activeTypes.includes('vocabulary') ? questions.filter(q => 
                    q.type === 'مفردة'
                ) : [];
                
                const otherQuestions = questions.filter(q => 
                    !errorQuestions.includes(q) && 
                    !comprehensionQuestions.includes(q) && 
                    !analogyQuestions.includes(q) && 
                    !completionQuestions.includes(q) && 
                    !vocabularyQuestions.includes(q)
                );
                
                // Combine all filtered questions
                const filteredQuestions = [
                    ...errorQuestions,
                    ...comprehensionQuestions,
                    ...analogyQuestions,
                    ...completionQuestions,
                    ...vocabularyQuestions
                ];
                
                // If we have filtered questions, use them
                if (filteredQuestions.length > 0) {
                    questions = filteredQuestions;
                }
                
                // Shuffle the questions
                this.shuffleArray(questions);
                
                // Step 4: Prepare quiz data
                if (this.freeRunnerMode) {
                    // In free runner mode, include ALL questions that meet the conditions
                    this.quizData = [...questions];
                    this.allQuestions = []; // Clear since we've used all questions
                } else {
                    // In normal mode, limit by question count
                    this.quizData = questions.slice(0, this.questionCount);
                    // Save remaining questions for later
                    this.allQuestions = questions.slice(this.questionCount);
                }
                
                return this.quizData;
            },
            
            setupTypeSliders() {
                // Initialize deleted slider tracker if not already initialized
                if (!this.undoInitialized) {
                    this.deletedSliders = [];
                    this.initialSliderTypes = [];
                    this.undoInitialized = true;
                    
                    // Store initial slider types
                    document.querySelectorAll('.slider-container').forEach(container => {
                        const typeClass = Array.from(container.classList).find(cls => cls.endsWith('-type'))?.replace('-type', '');
                        if (typeClass) {
                            this.initialSliderTypes.push(typeClass);
                        }
                    });
                    
                    // Set up undo delete button once
                    const undoDeleteBtn = document.getElementById('undoDeleteBtn');
                    undoDeleteBtn.addEventListener('click', () => this.handleUndoDeletion());
                }
                
                // We'll use this object to track locked sliders
                const lockedSliders = new Set();
                
                // We'll use this function to synchronize all sliders in real-time
                const synchronizeSliders = (changedSliderId, newValue) => {
                    // Get all active sliders
                    const activeSliders = Array.from(document.querySelectorAll('.slider-input'))
                        .filter(slider => !lockedSliders.has(slider.id)); // Skip locked sliders
                    
                    if (activeSliders.length <= 1) return; // Nothing to synchronize if only one slider
                    
                    // Get the current total without the changed slider
                    let total = 0;
                    const otherSliders = [];
                    
                    activeSliders.forEach(slider => {
                        if (slider.id === changedSliderId) {
                            total += parseInt(newValue) || 0;
                        } else {
                            const currentValue = parseInt(slider.value) || 0;
                            total += currentValue;
                            otherSliders.push({
                                slider: slider,
                                value: currentValue
                            });
                        }
                    });
                    
                    // If total is not 100, adjust other sliders proportionally
                    if (total !== 100 && otherSliders.length > 0) {
                        // How much we need to adjust
                        const excess = total - 100;
                        
                        // Calculate original sum of other sliders
                        const otherSlidersSum = otherSliders.reduce((sum, item) => sum + item.value, 0);
                        
                        if (otherSlidersSum === 0) {
                            // If other sliders sum to 0, distribute evenly
                            const valuePerSlider = Math.floor(Math.abs(excess) / otherSliders.length);
                            otherSliders.forEach(item => {
                                item.slider.value = excess > 0 ? 
                                    Math.max(0, item.value - Math.ceil(excess / otherSliders.length)) : 
                                    item.value + valuePerSlider;
                                    
                                // Update value display
                                const valueId = item.slider.id.replace('Slider', 'Value');
                                const valueDisplay = document.getElementById(valueId);
                                if (valueDisplay) {
                                    valueDisplay.textContent = `${item.slider.value}%`;
                                }
                            });
                        } else {
                            // Distribute proportionally based on current values
                            otherSliders.forEach(item => {
                                // Calculate proportion of this slider relative to total of other sliders
                                const proportion = item.value / otherSlidersSum;
                                
                                // Calculate adjustment amount
                                const adjustment = Math.round(excess * proportion);
                                
                                // Apply adjustment (subtract if excess is positive, add if negative)
                                const newSliderValue = Math.max(0, Math.min(100, item.value - adjustment));
                                item.slider.value = newSliderValue;
                                
                                // Update value display
                                const valueId = item.slider.id.replace('Slider', 'Value');
                                const valueDisplay = document.getElementById(valueId);
                                if (valueDisplay) {
                                    valueDisplay.textContent = `${newSliderValue}%`;
                                }
                            });
                        }
                    }
                    
                    // Update the chart
                    this.updateQuestionTypesChartRealtime();
                };
                
                // Setup lock buttons
                document.querySelectorAll('.lock-type-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const typeToLock = e.currentTarget.dataset.type;
                        const sliderId = `${typeToLock}TypeSlider`;
                        const slider = document.getElementById(sliderId);
                        const container = e.currentTarget.closest('.slider-container');
                        
                        if (lockedSliders.has(sliderId)) {
                            // Unlock
                            lockedSliders.delete(sliderId);
                            btn.classList.remove('locked');
                            container.classList.remove('locked');
                            slider.disabled = false;
                            
                            // Update tooltip
                            btn.title = "قفل هذا القسم";
                        } else {
                            // Lock
                            lockedSliders.add(sliderId);
                            btn.classList.add('locked');
                            container.classList.add('locked');
                            slider.disabled = true;
                            
                            // Update tooltip
                            btn.title = "فتح هذا القسم";
                        }
                    });
                });
                
                // Setup delete buttons
                document.querySelectorAll('.delete-type-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const typeToDelete = e.currentTarget.dataset.type;
                        const containerToDelete = e.currentTarget.closest('.slider-container');
                        
                        // Check if we have more than one container before deleting
                        const remainingContainers = document.querySelectorAll('.slider-container').length;
                        if (remainingContainers <= 1) {
                            // Use custom alert instead of browser alert
                            this.showCustomAlert({
                                icon: '❓',
                                title: 'تنبيه',
                                content: 'تسوق امها؟',
                                showCancel: false,
                                confirmText: 'طيب'
                            });
                            
                            // Add shake animation
                            containerToDelete.classList.add('deleting');
                            setTimeout(() => {
                                containerToDelete.classList.remove('deleting');
                            }, 500);
                            return;
                        }
                        
                        const sliderId = `${typeToDelete}TypeSlider`;
                        const sliderInput = document.getElementById(sliderId);
                        
                        if (sliderInput) {
                            // Store deleted slider info for undo
                            const deletedSlider = {
                                id: sliderId,
                                container: containerToDelete.cloneNode(true),
                                value: sliderInput.value,
                                name: containerToDelete.querySelector('.slider-label').textContent.trim()
                            };
                            
                            // Add to deletedSliders array
                            this.deletedSliders.push(deletedSlider);
                            
                            // Remove from locked set if it was locked
                            if (lockedSliders.has(sliderId)) {
                                lockedSliders.delete(sliderId);
                            }
                            
                            // Synchronize other sliders before removing this one
                            synchronizeSliders(sliderId, 0);
                            
                            // Set the value to 0 before removing
                            sliderInput.value = 0;
                            
                            const valueId = `${typeToDelete}TypeValue`;
                            const valueDisplay = document.getElementById(valueId);
                            if (valueDisplay) {
                                valueDisplay.textContent = '0%';
                            }
                            
                            // Apply exit animations
                            containerToDelete.classList.add('animate__fadeOutLeft', 'animate__zoomOut');
                            
                            // Show undo button immediately
                            const undoDeleteBtn = document.getElementById('undoDeleteBtn');
                            undoDeleteBtn.classList.add('active');
                            
                            setTimeout(() => {
                                containerToDelete.remove();
                                // Update the chart after removal
                                this.updateQuestionTypesChartRealtime();
                            }, 500);
                        }
                    });
                });
                
                // Setup slider input events
                document.querySelectorAll('.slider-input').forEach(slider => {
                    const valueId = slider.id.replace('Slider', 'Value');
                    const valueDisplay = document.getElementById(valueId);
                    
                    if (!valueDisplay) return;
                    
                    // Fix for slider value width to prevent element movement
                    valueDisplay.style.minWidth = '40px';
                    valueDisplay.style.textAlign = 'center';
                    
                    slider.addEventListener('input', (e) => {
                        // Skip if slider is locked
                        if (lockedSliders.has(slider.id)) return;
                        
                        // Update the value display
                        const newValue = e.target.value;
                        valueDisplay.textContent = `${newValue}%`;
                        
                        // Synchronize all other sliders in real-time
                        synchronizeSliders(slider.id, newValue);
                    });
                });
            },

            // Separate method to handle undo deletion
            handleUndoDeletion() {
                const undoDeleteBtn = document.getElementById('undoDeleteBtn');
                
                if (this.deletedSliders.length > 0) {
                    // Get the last deleted slider
                    const lastDeleted = this.deletedSliders.pop();
                    const container = lastDeleted.container;
                    const sliderId = lastDeleted.id;
                    const typeValue = lastDeleted.value;
                    const typeName = lastDeleted.name;
                    
                    // Create new slider container
                    const sliderContainer = document.createElement('div');
                    sliderContainer.className = `slider-container ${sliderId.replace('TypeSlider', '-type')}`;
                    sliderContainer.innerHTML = `
                        <div class="slider-header">
                            <span class="slider-label">
                                <span class="slider-color-dot"></span>
                                ${typeName}
                            </span>
                            <div class="slider-controls">
                                <span class="slider-value" id="${sliderId.replace('Slider', 'Value')}">${typeValue}%</span>
                                <button class="lock-type-btn" title="قفل هذا القسم" data-type="${sliderId.replace('TypeSlider', '')}">
                                    <svg viewBox="0 0 24 24">
                                        <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
                                    </svg>
                                </button>
                                <button class="delete-type-btn" title="حذف هذا القسم" data-type="${sliderId.replace('TypeSlider', '')}">
                                    <svg viewBox="0 0 24 24">
                                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                                    </svg>
                                </button>
                            </div>
                        </div>
                        <input type="range" class="slider-input" id="${sliderId}" min="0" max="100" value="${typeValue}">
                    `;
                    
                    // Append the new slider
                    const slidersList = document.querySelector('.question-type-sliders');
                    slidersList.appendChild(sliderContainer);
                    
                    // Re-attach event listeners
                    this.setupTypeSliders();
                    
                    // Update chart
                    this.updateQuestionTypesChartRealtime();
                    
                    // Keep undo button visible as long as there are deleted sliders
                    if (this.deletedSliders.length === 0) {
                        // Check if all types are restored
                        const currentTypes = [];
                        document.querySelectorAll('.slider-container').forEach(container => {
                            const typeClass = Array.from(container.classList).find(cls => cls.endsWith('-type'))?.replace('-type', '');
                            if (typeClass) {
                                currentTypes.push(typeClass);
                            }
                        });
                        
                        let allRestored = true;
                        for (const type of this.initialSliderTypes) {
                            if (!currentTypes.includes(type)) {
                                allRestored = false;
                                break;
                            }
                        }
                        
                        if (allRestored) {
                            undoDeleteBtn.classList.remove('active');
                        }
                    }
                }
            },

            // Custom alert system - now as a quick notification at the top of the screen
            showCustomAlert({ icon = '❓', title = 'تنبيه', content = '', confirmText = 'طيب', cancelText = 'إلغاء', showCancel = false, onConfirm = null, onCancel = null, autoHide = true, autoHideDelay = 3000 }) {
                const overlay = document.getElementById('customAlertOverlay');
                const alertIcon = document.getElementById('alertIcon');
                const alertTitle = document.getElementById('alertTitle');
                const alertContent = document.getElementById('alertContent');
                const confirmBtn = document.getElementById('alertConfirmBtn');
                const cancelBtn = document.getElementById('alertCancelBtn');
                
                // Clear any existing timers
                if (this.alertTimer) {
                    clearTimeout(this.alertTimer);
                }
                
                // Set content
                alertIcon.textContent = icon;
                alertTitle.textContent = title;
                alertContent.textContent = content;
                confirmBtn.textContent = confirmText;
                cancelBtn.textContent = cancelText;
                
                // Show/hide cancel button
                cancelBtn.style.display = showCancel ? 'block' : 'none';
                
                // Set border color based on icon
                const alertElement = overlay.querySelector('.custom-alert');
                if (icon === '✓' || icon === '✅') { // Checkmark
                    alertElement.style.borderRightColor = 'var(--correct)';
                } else if (icon === '❌') { // X mark
                    alertElement.style.borderRightColor = 'var(--wrong)';
                } else if (icon === '⚠️') { // Warning
                    alertElement.style.borderRightColor = 'var(--unanswered)';
                } else if (icon === 'ℹ️') { // Info
                    alertElement.style.borderRightColor = 'var(--primary-color)';
                } else {
                    alertElement.style.borderRightColor = 'var(--secondary-color)';
                }
                
                // Set up buttons
                confirmBtn.onclick = () => {
                    overlay.classList.remove('active');
                    if (onConfirm) onConfirm();
                };
                
                cancelBtn.onclick = () => {
                    overlay.classList.remove('active');
                    if (onCancel) onCancel();
                };
                
                // Show alert
                overlay.classList.add('active');
                
                // Auto-hide after delay if enabled
                if (autoHide) {
                    this.alertTimer = setTimeout(() => {
                        overlay.classList.remove('active');
                    }, autoHideDelay);
                }
            },

            updateQuestionTypesChartRealtime() {
                const typeValues = [];
                const typeColors = [];
                const typeLabels = [];
                
                // Only include types that actually exist in the DOM
                if (document.getElementById('analogyTypeSlider')) {
                    const value = parseInt(document.getElementById('analogyTypeSlider').value) || 0;
                    typeValues.push(value);
                    typeColors.push('#FFC107');
                    typeLabels.push('تناظر');
                }
                
                if (document.getElementById('completionTypeSlider')) {
                    const value = parseInt(document.getElementById('completionTypeSlider').value) || 0;
                    typeValues.push(value);
                    typeColors.push('#4CAF50');
                    typeLabels.push('اكمال');
                }
                
                if (document.getElementById('errorTypeSlider')) {
                    const value = parseInt(document.getElementById('errorTypeSlider').value) || 0;
                    typeValues.push(value);
                    typeColors.push('#FF5252');
                    typeLabels.push('خطأ');
                }
                
                if (document.getElementById('comprehensionTypeSlider')) {
                    const value = parseInt(document.getElementById('comprehensionTypeSlider').value) || 0;
                    typeValues.push(value);
                    typeColors.push('#2196F3');
                    typeLabels.push('استيعاب');
                }
                
                if (document.getElementById('vocabularyTypeSlider')) {
                    const value = parseInt(document.getElementById('vocabularyTypeSlider').value) || 0;
                    typeValues.push(value);
                    typeColors.push('#9C27B0');
                    typeLabels.push('مفردة');
                }
                
                if (this.typesChart) {
                    this.typesChart.data.datasets[0].data = typeValues;
                    this.typesChart.data.datasets[0].backgroundColor = typeColors;
                    this.typesChart.data.labels = typeLabels;
                    this.typesChart.update('none'); // Update without animation for smoother experience
                }
                
                // Calculate total for information purposes
                const total = typeValues.reduce((sum, val) => sum + val, 0);
                
                // Keep the title "نسب الأسئلة" in the chart center
                // (don't need to change this since user already updated it)
            },
            
            updateQuestionTypesChart() {
                this.updateQuestionTypesChartRealtime();
                
                // Full animation when called for complete updates
                if (this.typesChart) {
                    this.typesChart.update();
                }
            },
            
            initQuestionTypesChart() {
                const ctx = document.getElementById('questionTypesChart').getContext('2d');
                
                // Get actual values from sliders
                const typePercentages = this.getQuestionTypePercentages();
                const typeValues = [];
                const typeColors = [];
                const typeLabels = [];
                
                // Only include types that exist in the DOM
                if (document.getElementById('analogyTypeSlider')) {
                    typeValues.push(typePercentages.analogy);
                    typeColors.push('#FFC107');
                    typeLabels.push('تناظر');
                }
                
                if (document.getElementById('completionTypeSlider')) {
                    typeValues.push(typePercentages.completion);
                    typeColors.push('#4CAF50');
                    typeLabels.push('اكمال');
                }
                
                if (document.getElementById('errorTypeSlider')) {
                    typeValues.push(typePercentages.error);
                    typeColors.push('#FF5252');
                    typeLabels.push('خطأ');
                }
                
                if (document.getElementById('comprehensionTypeSlider')) {
                    typeValues.push(typePercentages.comprehension);
                    typeColors.push('#2196F3');
                    typeLabels.push('استيعاب');
                }
                
                if (document.getElementById('vocabularyTypeSlider')) {
                    typeValues.push(typePercentages.vocabulary);
                    typeColors.push('#9C27B0');
                    typeLabels.push('مفردة');
                }
                
                this.typesChart = new Chart(ctx, {
                    type: 'doughnut',
                    data: {
                        labels: typeLabels,
                        datasets: [{
                            data: typeValues,
                            backgroundColor: typeColors,
                            borderWidth: 0,
                            hoverOffset: 15
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: true,
                        cutout: '40%',
                        layout: {
                            padding: {
                                top: 30,
                                bottom: 30,
                                left: 30,
                                right: 30
                            }
                        },
                        animation: {
                            duration: 0
                        },
                        plugins: {
                            legend: {
                                display: false
                            },
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        const percentage = context.raw;
                                        const questionCount = parseInt(document.getElementById('questionCount').value) || 20;
                                        const questionNum = Math.round((percentage / 100) * questionCount);
                                        return `${questionNum} سؤال`;
                                    }
                                },
                                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                                padding: 12,
                                cornerRadius: 6,
                                titleFont: {
                                    size: 14,
                                    weight: 'bold'
                                },
                                bodyFont: {
                                    size: 14
                                },
                                displayColors: false,
                                position: 'custom',
                                enabled: true,
                                titleAlign: 'center',
                                bodyAlign: 'center',
                                caretSize: 10,
                                caretPadding: 15,
                                callbacks: {
                                    title: function() {
                                        return '';
                                    }
                                }
                            }
                        },
                        onClick: function(event, elements) {
                            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
                            if (isMobile && elements && elements.length > 0) {
                                const index = elements[0].index;
                                const percentage = this.data.datasets[0].data[index];
                                const label = this.data.labels[index];
                                const questionCount = parseInt(document.getElementById('questionCount').value) || 20;
                                const questionNum = Math.round((percentage / 100) * questionCount);
                                
                                // Show mobile tooltip
                                const mobileTooltip = document.getElementById('mobileTooltip');
                                mobileTooltip.textContent = `${label}: ${questionNum} سؤال`;
                                
                                // Position the tooltip
                                const chart = document.getElementById('questionTypesChart');
                                const chartRect = chart.getBoundingClientRect();
                                const centerX = chartRect.left + chartRect.width / 2;
                                const centerY = chartRect.top + chartRect.height / 2;
                                
                                mobileTooltip.style.left = `${centerX}px`;
                                mobileTooltip.style.top = `${centerY - 60}px`;
                                mobileTooltip.classList.add('active');
                                
                                // Hide tooltip after delay
                                setTimeout(() => {
                                    mobileTooltip.classList.remove('active');
                                }, 2000);
                            }
                        }.bind(this.typesChart)
                    }
                });
                
                // Custom tooltip position to move it away from center
                Chart.Tooltip.positioners.custom = function(elements, eventPosition) {
                    const chart = this.chart;
                    
                    if (!elements.length) {
                        return false;
                    }
                    
                    const { x, y } = eventPosition;
                    const chartWidth = chart.width;
                    const chartHeight = chart.height;
                    const chartCenterX = chartWidth / 2;
                    const chartCenterY = chartHeight / 2;
                    
                    // Calculate vector from center to event position
                    const vectorX = x - chartCenterX;
                    const vectorY = y - chartCenterY;
                    
                    // Normalize the vector
                    const length = Math.sqrt(vectorX * vectorX + vectorY * vectorY);
                    const normalizedX = vectorX / length;
                    const normalizedY = vectorY / length;
                    
                    // Position tooltip in the direction of the mouse but outside the chart
                    // Use the radius of the chart plus some padding
                    const radius = Math.min(chartWidth, chartHeight) / 2;
                    const padding = 40;
                    
                    return {
                        x: chartCenterX + normalizedX * (radius + padding),
                        y: chartCenterY + normalizedY * (radius + padding)
                    };
                };
            },

            // Add question timer methods
            startQuestionTimer() {
                // Clear any existing timer
                if (this.questionTimerInterval) {
                    clearInterval(this.questionTimerInterval);
                }
                
                // Get start time
                const startTime = Date.now();
                const timerElement = document.getElementById('questionTimer');
                
                if (!timerElement) return;
                
                // Set initial value
                timerElement.textContent = '0';
                
                // Update the timer every second - show seconds only
                this.questionTimerInterval = setInterval(() => {
                    const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
                    timerElement.textContent = elapsedSeconds.toString();
                }, 1000);
            },

            setupEmergencyPause() {
                // تحديث: استبدال مستمع Ctrl+Y بمستمع للضغط على المؤقت
                document.addEventListener('click', (e) => {
                    // التحقق من أن المستخدم في صفحة الاختبار
                    if (!document.querySelector('.quiz-page.active-page')) return;
                    
                    // التحقق من الضغط على المؤقت
                    if (e.target.id === 'questionTimer' || e.target.closest('#questionTimer')) {
                        this.triggerEmergencyPause();
                    }
                });
                
                // إعداد زر الاستئناف
                const resumeButton = document.getElementById('resumeButton');
                if (resumeButton) {
                    resumeButton.addEventListener('click', () => {
                        this.resumeFromEmergencyPause();
                    });
                }
            },
            
            triggerEmergencyPause() {
                // تحديث عدد الإيقافات المتبقية
                const remainingPauses = Math.max(0, this.emergencyPauseAllowed - this.emergencyPauseUsed);
                
                // عرض عدد الإيقافات المتبقية
                const remainingElement = document.getElementById('emergencyPauseRemaining');
                if (remainingElement) {
                    remainingElement.textContent = `متبقي لديك ${remainingPauses} إيقاف من أصل ${this.emergencyPauseAllowed} في هذا الاختبار`;
                }
                
                // التحقق من أن المستخدم لم يستخدم جميع الإيقافات المسموح بها
                if (this.emergencyPauseUsed >= this.emergencyPauseAllowed) {
                    this.showCustomAlert({
                        icon: '⚠️',
                        title: 'تنبيه',
                        content: 'لقد استخدمت جميع الإيقافات الطارئة المسموح بها لهذا الاختبار!',
                        confirmText: 'حسناً',
                        showCancel: false
                    });
                    return;
                }
                
                // إذا كان الإيقاف بالفعل نشطًا
                if (this.emergencyPauseActive) {
                    this.showCustomAlert({
                        icon: 'ℹ️',
                        title: 'تنبيه',
                        content: 'الاختبار متوقف بالفعل!',
                        confirmText: 'حسناً',
                        showCancel: false
                    });
                    return;
                }
                
                // تفعيل الإيقاف الطارئ
                this.emergencyPauseActive = true;
                this.emergencyPauseUsed++;
                this.emergencyPauseStartTime = Date.now();
                
                // إيقاف كل المؤقتات
                if (this.totalTimer) {
                    clearInterval(this.totalTimer);
                }
                
                if (this.questionTimerInterval) {
                    clearInterval(this.questionTimerInterval);
                }
                
                // إظهار شاشة الإيقاف الطارئ
                const overlay = document.getElementById('emergencyPauseOverlay');
                if (overlay) {
                    overlay.classList.add('active');
                    
                    // تحديث عدد الإيقافات المتبقية
                    remainingElement.textContent = `متبقي لديك ${remainingPauses - 1} إيقاف من أصل ${this.emergencyPauseAllowed} في هذا الاختبار`;
                }
                
                // بدء مؤقت الإيقاف
                this.startPauseTimer();
            },
            
            startPauseTimer() {
                const pauseTimerElement = document.getElementById('pauseTimer');
                if (!pauseTimerElement) return;
                
                this.pauseTimer = setInterval(() => {
                    const elapsedTime = Math.floor((Date.now() - this.emergencyPauseStartTime) / 1000);
                    const minutes = Math.floor(elapsedTime / 60).toString().padStart(2, '0');
                    const seconds = (elapsedTime % 60).toString().padStart(2, '0');
                    
                    pauseTimerElement.textContent = `${minutes}:${seconds}`;
                }, 1000);
            },
            
            resumeFromEmergencyPause() {
                if (!this.emergencyPauseActive) return;
                
                // إيقاف مؤقت الإيقاف
                if (this.pauseTimer) {
                    clearInterval(this.pauseTimer);
                }
                
                // إخفاء شاشة الإيقاف
                const overlay = document.getElementById('emergencyPauseOverlay');
                if (overlay) {
                    overlay.classList.remove('active');
                }
                
                // تحديث وقت البدء لحساب الوقت المتبقي بشكل صحيح
                if (!this.freeRunnerMode) {
                    const pauseDuration = Math.floor((Date.now() - this.emergencyPauseStartTime) / 1000);
                    this.startTime += (pauseDuration * 1000);
                    this.startTotalTimer();
                }
                
                // إعادة تشغيل مؤقت السؤال
                this.startQuestionTimer();
                
                // إعادة تعيين حالة الإيقاف
                this.emergencyPauseActive = false;
            },

            // Update remaining time per question indicator
            updateRemainingTimePerQuestion() {
                if (this.freeRunnerMode) return;
                
                const remainingTimeElement = document.getElementById('timeStandard');
                const timeDifferenceElement = document.getElementById('timeDifference');
                if (!remainingTimeElement || !timeDifferenceElement) return;

                const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
                const remainingTime = Math.max(0, this.totalTime - elapsed);
                const remainingQuestions = this.quizData.length - this.userAnswers.filter(ans => ans !== -1).length;
                
                if (remainingQuestions === 0) {
                    remainingTimeElement.textContent = '';
                    timeDifferenceElement.textContent = '';
                    return;
                }

                const timePerQuestion = Math.floor(remainingTime / remainingQuestions);
                this.timeStandardValue = timePerQuestion;
                remainingTimeElement.textContent = `${timePerQuestion}"`;
                
                // Show time difference if it exists
                if (this.timeDifferenceValue !== 0) {
                    const sign = this.timeDifferenceValue > 0 ? '+' : '';
                    timeDifferenceElement.textContent = `${sign}${this.timeDifferenceValue.toFixed(1)}"`;
                    timeDifferenceElement.className = 'time-difference ' + 
                        (this.timeDifferenceValue > 0 ? 'positive' : 'negative');
                }
            },

            // Add new method to add time to time bar
            addTimeToBar(seconds) {
                const timeBar = document.getElementById('timeBar');
                if (!timeBar) return;

                // Add shifting class to existing items
                Array.from(timeBar.children).forEach(item => {
                    item.classList.add('shifting');
                });

                const timeItem = document.createElement('div');
                timeItem.className = 'time-item sliding';
                
                // Compare with standard time and set color
                if (seconds < this.timeStandardValue) {
                    timeItem.classList.add('under');
                    this.timeDifferenceValue += (this.timeStandardValue - seconds);
                } else if (seconds > this.timeStandardValue) {
                    timeItem.classList.add('over');
                    this.timeDifferenceValue -= (seconds - this.timeStandardValue);
                } else {
                    timeItem.classList.add('equal');
                }
                
                timeItem.textContent = seconds;
                
                // Insert at the beginning
                if (timeBar.firstChild) {
                    timeBar.insertBefore(timeItem, timeBar.firstChild);
                } else {
                    timeBar.appendChild(timeItem);
                }

                // Clean up animation classes after they complete
                setTimeout(() => {
                    timeItem.classList.remove('sliding');
                    Array.from(timeBar.children).forEach(item => {
                        item.classList.remove('shifting');
                    });
                }, 300);

                // Update the time difference display
                this.updateRemainingTimePerQuestion();

                // Store the time
                this.questionTimes.push(seconds);
            },
        };

        document.addEventListener('DOMContentLoaded', () => {
            quizApp.init();
            
            // Blind Mode Functionality
            const blindModeBtn = document.getElementById('blindModeBtn');
            const eyeSlash = blindModeBtn.querySelector('.eye-slash');
            let blindModeActive = false;
            
            blindModeBtn.addEventListener('click', () => {
                blindModeActive = !blindModeActive;
                document.body.classList.toggle('blind-mode-active', blindModeActive);
                
                // Toggle the eye slash icon
                if (blindModeActive) {
                    eyeSlash.style.display = 'block';
                    blindModeBtn.querySelector('path:not(.eye-slash)').style.display = 'none';
                } else {
                    eyeSlash.style.display = 'none';
                    blindModeBtn.querySelector('path:not(.eye-slash)').style.display = 'block';
                }
                
                // Save preference to localStorage
                localStorage.setItem('blindModeActive', blindModeActive);
            });
            
            // Check if blind mode was previously enabled
            if (localStorage.getItem('blindModeActive') === 'true') {
                blindModeActive = true;
                document.body.classList.add('blind-mode-active');
                eyeSlash.style.display = 'block';
                blindModeBtn.querySelector('path:not(.eye-slash)').style.display = 'none';
            }
        });
// ميزة الاختيار عبر أزرار Numpad
// 4: الأعلى يسار (0)  5: الأعلى يمين (1)  1: الأسفل يسار (2)  2: الأسفل يمين (3)
document.addEventListener('keydown', function(e) {
    // تجاهل إذا كان هناك مدخلات نشطة (input/textarea)
    if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;
    // تحقق من الصفحة الحالية
    const optionsGrid = document.querySelector('.options-grid');
    if (!optionsGrid) return;
    const options = optionsGrid.querySelectorAll('.option');
    if (!options.length) return;
    // تحقق إذا تم الإجابة بالفعل (جميع الخيارات غير قابلة للنقر)
    let answered = true;
    options.forEach(opt => { if (opt.style.pointerEvents !== 'none') answered = false; });
    if (answered) return;
    let idx = -1;
    if (e.code === 'Numpad4') idx = 1; // الأعلى يمين
    else if (e.code === 'Numpad5') idx = 0; // الأعلى يسار
    else if (e.code === 'Numpad1') idx = 3; // الأسفل يمين
    else if (e.code === 'Numpad2') idx = 2; // الأسفل يسار
    if (idx >= 0 && idx < options.length) {
        options[idx].click();
        // تأثير بصري سريع عند الاختيار
        options[idx].style.boxShadow = '0 0 0 3px var(--primary-color)';
        setTimeout(() => { options[idx].style.boxShadow = ''; }, 200);
    }
});
