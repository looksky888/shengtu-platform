FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    CHROME_DEVEL_SANDBOX=/usr/local/sbin/chrome-devel-sandbox
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && playwright install --with-deps --no-shell chromium \
    && sandbox_path="$(find /ms-playwright -type f -name chrome_sandbox -print -quit)" \
    && test -n "$sandbox_path" \
    && cp "$sandbox_path" "$CHROME_DEVEL_SANDBOX" \
    && chown root:root "$CHROME_DEVEL_SANDBOX" \
    && chmod 4755 "$CHROME_DEVEL_SANDBOX" \
    && useradd --uid 10001 --create-home solver
COPY app.py browser.py turnstile_result.py discover_module.js profile.js vm.js THIRD_PARTY.md ./
USER solver
EXPOSE 8080
CMD ["python", "app.py"]
