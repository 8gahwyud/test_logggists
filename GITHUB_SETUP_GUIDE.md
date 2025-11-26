# 🚀 Полный гайд по настройке профессионального GitHub репозитория

## 📋 Содержание
1. [Создание репозитория](#создание-репозитория)
2. [Структура веток](#структура-веток)
3. [Настройка защиты веток](#настройка-защиты-веток)
4. [Настройка CI/CD](#настройка-cicd)
5. [Релизы и версионирование](#релизы-и-версионирование)
6. [Issues и Project Management](#issues-и-project-management)
7. [Настройка команды](#настройка-команды)
8. [Безопасность](#безопасность)

## 🏗️ Создание репозитория

### 1. Создание через GitHub Web Interface

```bash
# 1. Перейти на github.com
# 2. Нажать "New repository"
# 3. Заполнить данные:
#    - Repository name: truvo-logists
#    - Description: Платформа для логистов - веб-приложение для управления заказами
#    - Visibility: Private (рекомендуется для коммерческих проектов)
#    - Initialize with README: ✓
#    - Add .gitignore: Node
#    - Choose a license: MIT License (или другую подходящую)
```

### 2. Клонирование и первоначальная настройка

```bash
# Клонирование репозитория
git clone https://github.com/your-username/truvo-logists.git
cd truvo-logists

# Настройка пользователя (если не настроено глобально)
git config user.name "Your Name"
git config user.email "your.email@example.com"

# Добавление существующего проекта
cp -r /path/to/existing/project/* .
git add .
git commit -m "feat: initial project setup"
git push origin main
```

## 🌳 Структура веток

### Основные ветки

```
main (production)
├── develop (integration)
├── release/v1.0.0 (release preparation)
├── feature/user-authentication
├── feature/order-management
├── hotfix/critical-bug-fix
└── bugfix/minor-issue-fix
```

### Создание веток

```bash
# Создание ветки develop
git checkout -b develop
git push -u origin develop

# Создание feature ветки
git checkout develop
git checkout -b feature/user-authentication
git push -u origin feature/user-authentication

# Создание release ветки
git checkout develop
git checkout -b release/v1.0.0
git push -u origin release/v1.0.0

# Создание hotfix ветки
git checkout main
git checkout -b hotfix/critical-security-fix
git push -u origin hotfix/critical-security-fix
```

### Правила именования веток

```
feature/   - новая функциональность
bugfix/    - исправление багов
hotfix/    - критические исправления для продакшена
release/   - подготовка к релизу
docs/      - обновление документации
refactor/  - рефакторинг кода
test/      - добавление тестов
```

## 🛡️ Настройка защиты веток

### 1. Защита main ветки

```yaml
# Settings → Branches → Add rule
Branch name pattern: main
Restrictions:
  ✓ Require a pull request before merging
  ✓ Require approvals (minimum 2)
  ✓ Dismiss stale PR approvals when new commits are pushed
  ✓ Require review from code owners
  ✓ Require status checks to pass before merging
  ✓ Require branches to be up to date before merging
  ✓ Require conversation resolution before merging
  ✓ Restrict pushes that create files larger than 100MB
  ✓ Include administrators
```

### 2. Защита develop ветки

```yaml
Branch name pattern: develop
Restrictions:
  ✓ Require a pull request before merging
  ✓ Require approvals (minimum 1)
  ✓ Require status checks to pass before merging
  ✓ Require branches to be up to date before merging
```

### 3. CODEOWNERS файл

```bash
# Создание .github/CODEOWNERS
mkdir -p .github
cat > .github/CODEOWNERS << 'EOF'
# Global owners
* @team-lead @senior-dev

# Frontend
/components/ @frontend-team
/pages/ @frontend-team
/styles/ @frontend-team

# Backend
/backend/ @backend-team
/api/ @backend-team

# DevOps
/.github/ @devops-team
/docker/ @devops-team
/k8s/ @devops-team

# Documentation
/docs/ @tech-writer @team-lead
README.md @tech-writer
EOF
```

## 🔄 Настройка CI/CD

### 1. GitHub Actions Workflow

```yaml
# .github/workflows/ci.yml
name: CI/CD Pipeline

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    strategy:
      matrix:
        node-version: [16.x, 18.x]
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js ${{ matrix.node-version }}
      uses: actions/setup-node@v3
      with:
        node-version: ${{ matrix.node-version }}
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run linter
      run: npm run lint
    
    - name: Run tests
      run: npm test
    
    - name: Build application
      run: npm run build
    
    - name: Upload coverage reports
      uses: codecov/codecov-action@v3

  security:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    
    - name: Run security audit
      run: npm audit
    
    - name: Run Snyk security scan
      uses: snyk/actions/node@master
      env:
        SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}

  deploy:
    needs: [test, security]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Deploy to production
      run: |
        echo "Deploying to production..."
        # Add your deployment commands here
```

### 2. Настройка автоматических проверок

```yaml
# .github/workflows/pr-checks.yml
name: PR Checks

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  pr-validation:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    
    - name: Check PR title
      uses: amannn/action-semantic-pull-request@v4
      env:
        GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    
    - name: Check for breaking changes
      run: |
        if git diff --name-only origin/main...HEAD | grep -E "(package\.json|package-lock\.json)"; then
          echo "::warning::Dependencies changed - review carefully"
        fi
    
    - name: Validate commit messages
      run: |
        git log --oneline origin/main..HEAD | while read line; do
          if ! echo "$line" | grep -E "^[a-f0-9]+ (feat|fix|docs|style|refactor|test|chore)(\(.+\))?: .+"; then
            echo "::error::Invalid commit message format: $line"
            exit 1
          fi
        done
```

## 🏷️ Релизы и версионирование

### 1. Semantic Versioning

```
MAJOR.MINOR.PATCH (например: 1.2.3)

MAJOR - breaking changes (несовместимые изменения API)
MINOR - новая функциональность (обратно совместимая)
PATCH - исправления багов (обратно совместимые)
```

### 2. Автоматизация релизов

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    branches: [ main ]

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
      with:
        fetch-depth: 0
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Build
      run: npm run build
    
    - name: Create Release
      uses: cycjimmy/semantic-release-action@v3
      env:
        GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### 3. Конфигурация semantic-release

```json
// .releaserc.json
{
  "branches": ["main"],
  "plugins": [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    "@semantic-release/changelog",
    "@semantic-release/npm",
    "@semantic-release/github",
    [
      "@semantic-release/git",
      {
        "assets": ["CHANGELOG.md", "package.json"],
        "message": "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}"
      }
    ]
  ]
}
```

### 4. Ручное создание релиза

```bash
# 1. Создание release ветки
git checkout develop
git checkout -b release/v1.0.0

# 2. Обновление версии
npm version minor  # или major/patch

# 3. Обновление CHANGELOG
echo "## [1.0.0] - $(date +%Y-%m-%d)" >> CHANGELOG.md
echo "### Added" >> CHANGELOG.md
echo "- Новая функциональность" >> CHANGELOG.md

# 4. Коммит изменений
git add .
git commit -m "chore: prepare release v1.0.0"

# 5. Мерж в main
git checkout main
git merge --no-ff release/v1.0.0
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin main --tags

# 6. Мерж обратно в develop
git checkout develop
git merge --no-ff main
git push origin develop

# 7. Удаление release ветки
git branch -d release/v1.0.0
git push origin --delete release/v1.0.0
```

## 📝 Issues и Project Management

### 1. Настройка Issue Templates

```yaml
# .github/ISSUE_TEMPLATE/bug_report.yml
name: Bug Report
description: Сообщить о баге
title: "[BUG]: "
labels: ["bug", "triage"]
body:
  - type: markdown
    attributes:
      value: |
        Спасибо за сообщение о баге! Пожалуйста, заполните форму ниже.
  
  - type: textarea
    id: description
    attributes:
      label: Описание бага
      description: Четкое и краткое описание проблемы
      placeholder: Расскажите, что происходит...
    validations:
      required: true
  
  - type: textarea
    id: steps
    attributes:
      label: Шаги для воспроизведения
      description: Шаги для воспроизведения проблемы
      placeholder: |
        1. Перейти на '...'
        2. Нажать на '...'
        3. Прокрутить до '...'
        4. Увидеть ошибку
    validations:
      required: true
  
  - type: textarea
    id: expected
    attributes:
      label: Ожидаемое поведение
      description: Что должно было произойти
    validations:
      required: true
  
  - type: textarea
    id: environment
    attributes:
      label: Окружение
      description: |
        Информация об окружении:
        - OS: [например, iOS]
        - Browser: [например, chrome, safari]
        - Version: [например, 22]
    validations:
      required: true
```

### 2. Feature Request Template

```yaml
# .github/ISSUE_TEMPLATE/feature_request.yml
name: Feature Request
description: Предложить новую функциональность
title: "[FEATURE]: "
labels: ["enhancement"]
body:
  - type: textarea
    id: problem
    attributes:
      label: Проблема
      description: Какую проблему решает эта функциональность?
    validations:
      required: true
  
  - type: textarea
    id: solution
    attributes:
      label: Предлагаемое решение
      description: Как вы видите решение этой проблемы?
    validations:
      required: true
  
  - type: textarea
    id: alternatives
    attributes:
      label: Альтернативы
      description: Рассматривали ли вы альтернативные решения?
```

### 3. Pull Request Template

```markdown
<!-- .github/pull_request_template.md -->
## 📝 Описание

Краткое описание изменений в этом PR.

## 🔗 Связанные Issues

Fixes #(номер issue)

## 📋 Тип изменений

- [ ] Bug fix (исправление, не ломающее существующую функциональность)
- [ ] New feature (новая функциональность, не ломающая существующую)
- [ ] Breaking change (исправление или функциональность, которая ломает существующую)
- [ ] Documentation update (обновление документации)

## 🧪 Тестирование

- [ ] Тесты проходят локально
- [ ] Добавлены новые тесты для новой функциональности
- [ ] Обновлены существующие тесты

## 📸 Скриншоты (если применимо)

## ✅ Чеклист

- [ ] Код соответствует стандартам проекта
- [ ] Проведен self-review кода
- [ ] Код прокомментирован в сложных местах
- [ ] Обновлена документация
- [ ] Изменения не генерируют новых предупреждений
- [ ] Добавлены тесты для новой функциональности
- [ ] Все тесты проходят
```

## 👥 Настройка команды

### 1. Роли и права доступа

```yaml
# Settings → Manage access
Roles:
  Admin: 
    - Полный доступ к репозиторию
    - Управление настройками
    - Управление командой
  
  Maintain:
    - Управление issues и PR
    - Управление релизами
    - Не может изменять настройки
  
  Write:
    - Создание веток
    - Создание PR
    - Мерж в разрешенные ветки
  
  Triage:
    - Управление issues и PR
    - Не может писать код
  
  Read:
    - Только чтение
    - Клонирование репозитория
```

### 2. Настройка команд

```bash
# Создание команд в организации
Teams:
  - @frontend-team (Write access)
  - @backend-team (Write access)
  - @devops-team (Maintain access)
  - @qa-team (Triage access)
  - @management (Read access)
```

## 🔒 Безопасность

### 1. Настройка Secrets

```bash
# Settings → Secrets and variables → Actions
Required secrets:
  - DEPLOY_KEY: SSH ключ для деплоя
  - DATABASE_URL: URL базы данных
  - API_SECRET: Секретный ключ API
  - SNYK_TOKEN: Токен для Snyk сканирования
  - CODECOV_TOKEN: Токен для Codecov
```

### 2. Dependabot Configuration

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
    reviewers:
      - "devops-team"
    assignees:
      - "tech-lead"
    commit-message:
      prefix: "chore"
      include: "scope"
  
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "monthly"
```

### 3. Security Policy

```markdown
<!-- SECURITY.md -->
# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

Если вы обнаружили уязвимость безопасности, пожалуйста:

1. **НЕ** создавайте публичный issue
2. Отправьте email на security@company.com
3. Включите максимально подробное описание
4. Мы ответим в течение 48 часов

## Security Measures

- Все зависимости регулярно обновляются
- Автоматическое сканирование уязвимостей
- Обязательный code review
- Защищенные ветки
```

## 📊 Мониторинг и аналитика

### 1. GitHub Insights

```bash
# Настройка в Settings → Insights
Enable:
  - Dependency graph
  - Dependabot alerts
  - Code scanning alerts
  - Secret scanning alerts
```

### 2. Настройка уведомлений

```yaml
# .github/workflows/notifications.yml
name: Notifications

on:
  issues:
    types: [opened, closed]
  pull_request:
    types: [opened, closed, merged]

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
    - name: Slack Notification
      uses: 8398a7/action-slack@v3
      with:
        status: ${{ job.status }}
        channel: '#development'
        webhook_url: ${{ secrets.SLACK_WEBHOOK }}
```

## 🚀 Лучшие практики

### 1. Commit Messages

```bash
# Формат: type(scope): description
feat(auth): add user login functionality
fix(orders): resolve order status update issue
docs(readme): update installation instructions
style(ui): improve button styling
refactor(api): optimize database queries
test(auth): add unit tests for login
chore(deps): update dependencies
```

### 2. Branch Naming

```bash
# Хорошие примеры
feature/user-authentication
feature/order-management-system
bugfix/login-validation-error
hotfix/security-vulnerability-fix
docs/api-documentation-update

# Плохие примеры
fix
new-feature
john-branch
temp
```

### 3. Code Review Guidelines

```markdown
## Code Review Checklist

### Функциональность
- [ ] Код делает то, что должен
- [ ] Логика корректна
- [ ] Нет очевидных багов

### Дизайн
- [ ] Код хорошо структурирован
- [ ] Соблюдаются принципы SOLID
- [ ] Нет дублирования кода

### Читаемость
- [ ] Код легко читается
- [ ] Переменные и функции имеют понятные имена
- [ ] Сложная логика прокомментирована

### Тестирование
- [ ] Добавлены необходимые тесты
- [ ] Тесты покрывают edge cases
- [ ] Все тесты проходят

### Безопасность
- [ ] Нет уязвимостей безопасности
- [ ] Входные данные валидируются
- [ ] Секреты не хардкодятся
```

## 📚 Дополнительные ресурсы

- [GitHub Flow](https://guides.github.com/introduction/flow/)
- [Semantic Versioning](https://semver.org/)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Git Flow](https://nvie.com/posts/a-successful-git-branching-model/)

---

**Примечание**: Этот гайд является базовой настройкой. Адаптируйте его под специфику вашего проекта и команды.
