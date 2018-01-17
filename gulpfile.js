var gulp = require('gulp'),
    concat = require('gulp-concat'),
    watch = require('gulp-watch'),
    sass = require('gulp-sass'),
    include = require('gulp-include'),
    plumber = require('gulp-plumber'),
    sourcemaps = require('gulp-sourcemaps'),
    electron = require('electron-connect').server.create();

gulp.task('app-sass', function () {
    gulp.src(['src/sass/ui.scss'])
        .pipe(plumber())
        .pipe(sourcemaps.init())
        .pipe(sass().on('error', sass.logError))
        .pipe(sass({ outputStyle: 'compressed' }))
        .pipe(concat('app.min.css'))
        .pipe(sourcemaps.write())
        .pipe(gulp.dest('assets/css/'));
});

gulp.task('watch', function () {
    gulp.watch(['src/**/*.scss'], ['app-sass']);
    gulp.watch(['assets/**/*.css', 'assets/**/*.js', 'src/**/*.js', 'index.html'], electron.reload);
});

gulp.task('electron', function () {
    electron.start("--enable-logging");
});

gulp.task('default', ['app-sass', 'watch', 'electron']);
gulp.task('build', ['app-sass']);