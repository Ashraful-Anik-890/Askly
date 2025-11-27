# Askly (Flutter Version)

Askly is a sophisticated, context-aware AI chatbot application developed using Google's Gemini API and Flutter. It remembers your preferences, facts, and goals over time.

**Developed by MD. Ashraful Al Amin**

## Features

- **Cross-Platform:** Runs on Web, Android, iOS, Windows, and macOS.
- **Context Memory:** Visual panel showing what the AI has remembered about you.
- **Auto-Persist:** Saves conversations and memories to local storage.
- **Gemini Powered:** Uses the latest Gemini 1.5 Flash models for fast, intelligent responses.

## Getting Started

### Prerequisites

1.  **Flutter SDK:** [Install Flutter](https://flutter.dev/docs/get-started/install)
2.  **VS Code:** With the "Flutter" and "Dart" extensions installed.

### Installation

1.  Open the project in VS Code.
2.  Open the file `.env` and paste your Gemini API Key:
    ```env
    API_KEY=your_actual_api_key_here
    ```
3.  Open the terminal in VS Code (`Ctrl+~`).
4.  Run the following command to download libraries:
    ```bash
    flutter pub get
    ```

### Running the App

*   **For Web:**
    ```bash
    flutter run -d chrome
    ```
*   **For Desktop (Windows/Mac):**
    ```bash
    flutter run -d windows
    # or
    flutter run -d macos
    ```

## Project Structure

*   `lib/models`: Defines data structures (Chat messages, Memory items).
*   `lib/services`: Handles saving data and talking to the Gemini AI.
*   `lib/providers`: Manages the application state (logic).
*   `lib/ui`: Contains the screens and widgets (Sidebar, Chat Bubble, etc.).
