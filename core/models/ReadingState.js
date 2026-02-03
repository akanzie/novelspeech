export class ReadingState {
  constructor() {
    this.chapterUrl = '';
    this.currentLineIndex = 0;
    this.status = 'stopped'; // playing, paused, stopped
    this.settings = {
      rate: 1.0,
      pitch: 1.0,
      volume: 1.0,
      voice: 'vi-VN-HoaiMyNeural',
      autoscroll: true,
      highlight: true
    };
    this.content = [];
    this.metadata = {
      chapterTitle: '',
      totalLines: 0,
      startTime: null,
      endTime: null
    };
  }
}
