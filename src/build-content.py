#!/usr/bin/env python3
"""Assemble the public course without changing any workbook content.

Usage: python3 src/build-content.py --source-dir /path/to/workbook-json
The committed public/course.json is self-contained; this script is only needed
when the source workbook is updated.
"""

import argparse
import copy
import json
from pathlib import Path


SOURCE_FILES = (
    "days_01_10.json",
    "days_11_20.json",
    "days_21_30.json",
)
ICONS = {"wave", "spark", "chat", "briefcase", "headphones", "check", "film", "calendar"}

# Day, English title, short description, category, icon.
DAY_UI = [
    (1, "Introduce yourself", "Record your starting point and introduce yourself to a new team.", "Foundations", "wave"),
    (2, "Your daily routine", "Describe your work, responsibilities and a typical day.", "Foundations", "calendar"),
    (3, "Usually vs right now", "Explain what you usually do and what you are doing at this moment.", "Foundations", "spark"),
    (4, "Ask and clarify", "Ask for repetition, check what you heard and confirm important details.", "Conversation", "chat"),
    (5, "Make and change plans", "Arrange a time, respond to a change and confirm the new plan.", "Conversation", "calendar"),
    (6, "Order and ask politely", "Book a table, place an order and correct a misunderstanding.", "Conversation", "chat"),
    (7, "Your first checkpoint", "Try familiar situations with new details before reviewing the lessons.", "Checkpoint", "check"),
    (8, "Tell a past story", "Describe what happened, add details and explain how the story ended.", "Conversation", "chat"),
    (9, "Explain the steps", "Guide someone through a familiar task and check their understanding.", "Workplace", "briefcase"),
    (10, "Make your work clear", "Explain your job in simple words to someone outside your field.", "Workplace", "briefcase"),
    (11, "Give a work update", "Summarize yesterday, today's work, a blocker and your next step.", "Workplace", "briefcase"),
    (12, "Clarify what is needed", "Turn a vague request into a clear result, deadline and priority.", "Workplace", "chat"),
    (13, "Ask for help and find options", "Make a specific request, handle a refusal and suggest another option.", "Workplace", "chat"),
    (14, "Your second checkpoint", "Use familiar language in new everyday and workplace situations.", "Checkpoint", "check"),
    (15, "Explain a problem", "Describe what went wrong, its impact and the help you need.", "Workplace", "briefcase"),
    (16, "Facts and possibilities", "Separate confirmed facts from possible explanations and unknowns.", "Workplace", "spark"),
    (17, "Handle unexpected questions", "Clarify a new question and answer without preparing a full script.", "Conversation", "chat"),
    (18, "Compare two options", "Explain each option's benefits and limits, then make a recommendation.", "Workplace", "briefcase"),
    (19, "Adapt to your audience", "Keep the facts the same while changing the detail for your listener.", "Workplace", "briefcase"),
    (20, "Give a short demo", "Show three clear steps, explain their purpose and answer questions.", "Workplace", "briefcase"),
    (21, "Your third checkpoint", "Discuss a new problem, handle interruptions and confirm the next step.", "Checkpoint", "check"),
    (22, "Keep a conversation going", "Follow an unplanned conversation with details and questions of your own.", "Conversation", "chat"),
    (23, "Join in and disagree politely", "Explain your view, respond to an objection and suggest common ground.", "Workplace", "chat"),
    (24, "Listen for the details", "Catch the main point, places and numbers, then explain your recommendation.", "Listening", "headphones"),
    (25, "Retell for a new audience", "Tell the same story to two different listeners without changing the facts.", "Conversation", "chat"),
    (26, "Agree on realistic deadlines", "Discuss priorities, available time and a plan you can deliver.", "Workplace", "calendar"),
    (27, "Speak clearly about uncertainty", "Share the facts, a possible cause and the time of your next update.", "Workplace", "briefcase"),
    (28, "Lead a full meeting", "Bring together updates, questions, decisions, responsibilities and deadlines.", "Workplace", "briefcase"),
    (29, "Fix recurring difficulties", "Use your two most difficult language patterns in fresh situations.", "Review", "spark"),
    (30, "Final check and next steps", "Compare your first and final recordings, then choose two goals to work on next.", "Checkpoint", "check"),
]

WEEKS = [
    {
        "id": 1,
        "title_en": "Start speaking",
        "title_hy": "Առօրյա խոսքի հիմքեր",
        "description_en": "Introduce yourself, ask clear questions and handle everyday plans and requests.",
        "days": list(range(1, 8)),
    },
    {
        "id": 2,
        "title_en": "Explain your work",
        "title_hy": "Պատմել և բացատրել աշխատանքը",
        "description_en": "Tell stories, explain a process, give updates and clarify what someone needs.",
        "days": list(range(8, 15)),
    },
    {
        "id": 3,
        "title_en": "Work through problems",
        "title_hy": "Քննարկել խնդիրներ և լուծումներ",
        "description_en": "Describe problems, compare options, adapt your explanation and handle new questions.",
        "days": list(range(15, 22)),
    },
    {
        "id": 4,
        "title_en": "Speak more independently",
        "title_hy": "Ավելի ինքնուրույն զրույց",
        "description_en": "Keep conversations going, lead a meeting and measure your progress in new situations.",
        "days": list(range(22, 31)),
    },
]


def build_course(source_dir: Path) -> dict:
    source_days = []
    for filename in SOURCE_FILES:
        source_days.extend(json.loads((source_dir / filename).read_text(encoding="utf-8")))
    source_extras = json.loads((source_dir / "full_workbook_extras.json").read_text(encoding="utf-8"))

    assert [day["day"] for day in source_days] == list(range(1, 31)), "Days must be ordered 1–30."
    assert [entry[0] for entry in DAY_UI] == list(range(1, 31)), "UI metadata must cover every day."

    week_for_day = {day: week["id"] for week in WEEKS for day in week["days"]}
    assert sorted(week_for_day) == list(range(1, 31)), "Week membership must cover all 30 days."
    assert sum(len(week["days"]) for week in WEEKS) == 30, "Days must appear in only one week."

    days = copy.deepcopy(source_days)
    added_keys = {"title_en", "short_en", "week", "category_en", "icon"}
    for day, (number, title, short, category, icon) in zip(days, DAY_UI):
        assert day["day"] == number
        assert not (added_keys & day.keys()), "Do not overwrite an original workbook field."
        assert len(short) < 100, f"Day {number}: short_en must be under 100 characters."
        assert icon in ICONS, f"Day {number}: unsupported icon."
        assert len(day["drill"]["items"]) == len(day["drill"]["answers"]) == 3
        assert len(day["input_tasks"]) == len(day["input_answers"]) == 3
        assert len(day["questions"]) == 4
        for source_name in ("primary", "support"):
            assert day[source_name]["url"].startswith("https://")
        day.update(
            title_en=title,
            short_en=short,
            week=week_for_day[number],
            category_en=category,
            icon=icon,
        )

    counts = {
        "days": len(days),
        "drills": sum(len(day["drill"]["items"]) for day in days),
        "input_questions": sum(len(day["input_tasks"]) for day in days),
        "conversation_questions": sum(len(day["questions"]) for day in days),
        "chunks": sum(len(day["chunks"]) for day in days),
        "movies": len(source_extras["movies"]),
    }
    assert counts == {
        "days": 30,
        "drills": 90,
        "input_questions": 90,
        "conversation_questions": 120,
        "chunks": 149,
        "movies": 4,
    }, counts

    for original, enriched in zip(source_days, days):
        assert {key: enriched[key] for key in original} == original, "Original content changed."
        assert set(enriched) == set(original) | added_keys, "Unexpected fields were removed or added."

    course = {
        "schema_version": 1,
        "title_en": "30 Days of Spoken English",
        "title_hy": source_extras["title"],
        "daily_minutes": 120,
        "weeks": copy.deepcopy(WEEKS),
        "days": days,
        "extras": copy.deepcopy(source_extras),
        "counts": counts,
    }
    assert course["extras"] == source_extras, "Extras must remain unchanged."
    assert course["days"][29]["partner_only"] == source_days[29]["partner_only"]
    return course


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "public" / "course.json")
    args = parser.parse_args()
    course = build_course(args.source_dir)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(course, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output), "counts": course["counts"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
